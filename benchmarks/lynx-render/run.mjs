// Node-only timing benchmark comparing compiled Octane and ReactLynx.
//
// It bundles the real background root, async transport, main-thread receiver,
// and host driver with the real Octane compiler, then drives them through a
// identical cheap fake Element PAPI. ReactLynx runs its published production
// Snapshot compiler, runtime, background render, and real main-thread patch.
// Octane's one-shot first-screen phases run its separately compiled main-thread
// layer. This makes no native paint, layout, or device claim.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildLynxRenderWorkload, measureLynxRenderFixtureBytes } from './build.mjs';
import { createReactWorkload } from './react-workload.mjs';

const rawIterations = process.argv[2] ?? '5';
const iterations = Number(rawIterations);

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

function timingStat(samples) {
	const sorted = [...samples].sort((first, second) => first - second);
	const median = sorted[Math.floor((sorted.length - 1) / 2)];
	const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
	const variance =
		sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, sorted.length);
	return {
		score: median,
		median,
		min: sorted[0],
		mean,
		p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
		sd: Math.sqrt(variance),
		rme: mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100,
		warmupRatio: 1,
		samples: sorted.length,
	};
}

// A deterministic work counter. It deliberately carries no `score`, which marks
// a timing stat for the pull request report, so the report lists it exactly.
function countStat(value) {
	return { median: value, min: value, samples: 1 };
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-render-'));
let payload;
let reactWorkload;

try {
	const bundles = await buildLynxRenderWorkload(tempDir);
	const workload = await import(pathToFileURL(bundles.background).href);
	reactWorkload = await createReactWorkload(workload, tempDir);

	// A Lynx page evaluates each thread's bundle once and creates one root, and
	// the first screen's adoption handshake is defined for that first root. The
	// one-shot variants therefore get fresh module instances for every sample:
	// they measure a cold page load, including first execution of the code
	// they reach, and are not comparable with the warm `octane-lynx` mounts.
	// They run only after every warm sample: each retains its module instances
	// and allocates the large adoption messages, which would otherwise land
	// garbage collection inside the warm ratio-guarded timings.
	let instance = 0;
	const freshLayers = async () => {
		instance++;
		const [background, main] = await Promise.all([
			import(`${pathToFileURL(bundles.background).href}?instance=${instance}`),
			import(`${pathToFileURL(bundles.main).href}?instance=${instance}`),
		]);
		return { background, main };
	};

	const failures = [];
	const targets = new Map();
	const targetOf = (name) => {
		let target = targets.get(name);
		if (target === undefined) targets.set(name, (target = { ops: new Map(), meta: {} }));
		return target;
	};
	const record = (name, op, value) => {
		const target = targetOf(name);
		let samples = target.ops.get(op);
		if (samples === undefined) target.ops.set(op, (samples = []));
		samples.push(value);
		return target;
	};
	const recordCounter = (name, op, value) => targetOf(name).ops.set(op, value);

	const cases = [
		{ op: 'empty_startup_ms', rows: null, createdElements: 2, eventTokens: 0 },
		{ op: 'create_1k_rows_ms', rows: 1_000, createdElements: 9_008, eventTokens: 2_000 },
		{ op: 'create_10k_rows_ms', rows: 10_000, createdElements: 90_008, eventTokens: 20_000 },
		{ op: 'update_1k_rows_ms', rows: 1_000, createdElements: 9_008, eventTokens: 2_000 },
		{ op: 'update_10k_rows_ms', rows: 10_000, createdElements: 90_008, eventTokens: 20_000 },
	];
	const createCases = cases.filter((scenario) => scenario.op.startsWith('create_'));

	// Every Octane mount of the keyed rows ships one compiled program run.
	function expectProgramRun(name, scenario, result) {
		const transport = result.transport;
		if (transport?.templateCommands < scenario.rows) {
			failures.push(
				`${name} ${scenario.op}: mounted ${transport.templateCommands} compiled templates, expected at least ${scenario.rows}.`,
			);
		}
		if (transport?.templateNodes < scenario.rows * 9) {
			failures.push(
				`${name} ${scenario.op}: compiled templates created ${transport.templateNodes} hosts, expected at least ${scenario.rows * 9}.`,
			);
		}
		if (
			transport?.programCommands !== scenario.rows ||
			transport?.programRuns !== 1 ||
			transport?.sharedPrograms !== 1
		) {
			failures.push(
				`${name} ${scenario.op}: mounted ${transport?.programCommands ?? 0} rows in ${transport?.programRuns ?? 0} runs from ${transport?.sharedPrograms ?? 0} shared definitions, expected ${scenario.rows} rows, one run, and one definition.`,
			);
		}
		if (transport?.commands > 24) {
			failures.push(
				`${name} ${scenario.op}: emitted ${transport.commands} wire commands for one program run of ${scenario.rows} rows.`,
			);
		}
		if (transport?.compactAcknowledgements !== 1) {
			failures.push(
				`${name} ${scenario.op}: received ${transport?.compactAcknowledgements ?? 0} compact acknowledgements, expected one.`,
			);
		}
		if (result.privateSelectors > 8) {
			failures.push(
				`${name} ${scenario.op}: eagerly installed ${result.privateSelectors} renderer-private selectors on a ref-free tree.`,
			);
		}
	}

	// The main thread paints every host itself and sends nothing to the
	// background until the background asks.
	function expectFirstScreen(name, scenario, result) {
		if (result.renders.main !== 1 || result.renders.background !== 0) {
			failures.push(
				`${name} ${scenario.op}: rendered the app ${result.renders.main} time(s) on main and ${result.renders.background} on background, expected once on main only.`,
			);
		}
		if (result.wire.framesToMain !== 0) {
			failures.push(
				`${name} ${scenario.op}: the background sent ${result.wire.framesToMain} frame(s) during the main-thread first screen.`,
			);
		}
	}

	// Adoption keeps every first-screen host and routes its events to the
	// background. A mismatch silently re-creates the tree, so it is a failure.
	function expectAdoption(name, scenario, result) {
		if (result.hostsCreatedDuringAdoption !== 0) {
			failures.push(
				`${name} ${scenario.op}: created ${result.hostsCreatedDuringAdoption} hosts while adopting a complete first screen, expected none.`,
			);
		}
		if (!result.retainedIdentity) {
			failures.push(`${name} ${scenario.op}: adoption replaced first-screen host identities.`);
		}
		if (result.firstScreenChecksum !== result.reachableChecksum) {
			failures.push(`${name} ${scenario.op}: adoption changed the visible first-screen tree.`);
		}
		if (!result.adoptedTapHandled) {
			failures.push(
				`${name} ${scenario.op}: a native tap on the adopted tree did not reach its background handler.`,
			);
		}
		if (result.renders.background !== 1 || result.renders.main !== 0) {
			failures.push(
				`${name} ${scenario.op}: rendered the app ${result.renders.background} time(s) on background and ${result.renders.main} on main while adopting, expected once on background only.`,
			);
		}
	}

	// Each variant names its renderer path, the scenarios it runs, and the
	// structural expectations a sample must meet before its time counts.
	const runOctane = (background, scenario, options) => {
		if (scenario.rows === null) return background.runEmptyStartup(options);
		return scenario.op.startsWith('update_')
			? background.runUpdateRows(scenario.rows, options)
			: background.runCreateRows(scenario.rows, options);
	};
	// Counters must not depend on what ran before: the warm bundle's listener
	// identities, and so its wire bytes, grow with every root it has created.
	// Each Octane variant therefore counts its work once on a fresh page.
	const variants = [
		{
			name: 'octane-lynx',
			phase: 'warm',
			cases,
			run: (scenario, options) => runOctane(workload, scenario, options),
			async count(scenario) {
				const { background } = await freshLayers();
				return runOctane(background, scenario, { countCalls: true });
			},
			expect(name, scenario, result) {
				if (scenario.rows !== null) expectProgramRun(name, scenario, result);
			},
		},
		{
			name: 'react-lynx',
			phase: 'warm',
			cases,
			run(scenario) {
				if (scenario.rows === null) return reactWorkload.runEmptyStartup();
				return scenario.op.startsWith('update_')
					? reactWorkload.runUpdateRows(scenario.rows)
					: reactWorkload.runCreateRows(scenario.rows);
			},
		},
		{
			// The background-only mount on a cold page: the reference for the
			// first screen and adoption, which a page load pays instead.
			name: 'octane-lynx-cold',
			phase: 'cold',
			cases: createCases,
			async run(scenario, options) {
				const { background } = await freshLayers();
				return background.runCreateRows(scenario.rows, options);
			},
			count: (scenario) => coldVariant('octane-lynx-cold').run(scenario, { countCalls: true }),
			expect: expectProgramRun,
		},
		{
			name: 'octane-lynx-first-screen',
			phase: 'cold',
			cases: createCases,
			async run(scenario, options) {
				const { background, main } = await freshLayers();
				return background.runFirstScreen(scenario.rows, main, options);
			},
			count: (scenario) =>
				coldVariant('octane-lynx-first-screen').run(scenario, { countCalls: true }),
			expect: expectFirstScreen,
		},
		{
			name: 'octane-lynx-adopt',
			phase: 'cold',
			cases: createCases,
			async run(scenario, options) {
				const { background, main } = await freshLayers();
				return background.runAdoption(scenario.rows, main, options);
			},
			count: (scenario) => coldVariant('octane-lynx-adopt').run(scenario, { countCalls: true }),
			expect: expectAdoption,
		},
	];
	const coldVariant = (name) => variants.find((variant) => variant.name === name);
	const referenceChecksums = new Map();

	function validate(variant, scenario, result) {
		const name = variant.name;
		if (result.diagnostics.length !== 0) {
			failures.push(`${name} ${scenario.op}: ${result.diagnostics.join(' | ')}`);
		}
		if (result.createdElements !== scenario.createdElements) {
			failures.push(
				`${name} ${scenario.op}: created ${result.createdElements} hosts, expected ${scenario.createdElements}.`,
			);
		}
		if (result.eventTokens !== scenario.eventTokens) {
			failures.push(
				`${name} ${scenario.op}: installed ${result.eventTokens} events, expected ${scenario.eventTokens}.`,
			);
		}
		variant.expect?.(name, scenario, result);
		const reference = referenceChecksums.get(scenario.op);
		if (reference === undefined) referenceChecksums.set(scenario.op, result.reachableChecksum);
		else if (reference !== result.reachableChecksum) {
			failures.push(
				`${name} ${scenario.op}: visible-tree checksum ${result.reachableChecksum} differs from ${reference}.`,
			);
		}
	}

	// Work counters for one untimed run: wire traffic, component executions, and
	// Element PAPI calls inside the interval the timer would cover.
	function recordCounters(variant, scenario, result) {
		const prefix = scenario.op.replace(/_ms$/, '');
		recordCounter(
			variant.name,
			`${prefix}_frames`,
			result.wire.framesToMain + result.wire.framesToBackground,
		);
		recordCounter(variant.name, `${prefix}_bytes_to_main`, result.wire.bytesToMain);
		recordCounter(variant.name, `${prefix}_bytes_to_background`, result.wire.bytesToBackground);
		recordCounter(
			variant.name,
			`${prefix}_component_renders`,
			result.renders.background + result.renders.main,
		);
		let papiCalls = 0;
		for (const calls of Object.values(result.papiCalls)) papiCalls += calls;
		recordCounter(variant.name, `${prefix}_papi_calls`, papiCalls);
		const meta = targetOf(variant.name).meta;
		(meta.papiCalls ??= {})[scenario.op] = result.papiCalls;
	}

	// Warm every variant of a phase once per scenario and reject
	// allocation-only/no-op runs before recording any of its timing samples.
	async function samplePhase(phase) {
		const members = variants.filter((variant) => variant.phase === phase);
		for (const scenario of cases) {
			for (const variant of members) {
				if (!variant.cases.includes(scenario)) continue;
				validate(variant, scenario, await variant.run(scenario, {}));
			}
		}
		for (let iteration = 0; iteration < iterations; iteration++) {
			for (const scenario of cases) {
				// Alternating variant order limits steady-state/JIT and GC bias.
				const ordered = iteration % 2 === 0 ? members : [...members].reverse();
				for (const variant of ordered) {
					if (!variant.cases.includes(scenario)) continue;
					const result = await variant.run(scenario, {});
					validate(variant, scenario, result);
					const target = record(variant.name, scenario.op, result.durationMs);
					target.meta[scenario.op] = {
						createdElements: result.createdElements,
						eventTokens: result.eventTokens,
						privateSelectors: result.privateSelectors,
						checksum: result.checksum,
						reachableChecksum: result.reachableChecksum,
						...(result.transport === undefined ? null : { transport: result.transport }),
					};
				}
			}
		}
	}

	await samplePhase('warm');
	const reentrantCommitCases = [10_000, 20_000];
	function validateReentrantCommits(count, result) {
		const target = `octane-lynx-reentrant-${count / 1_000}k`;
		if (result.diagnostics.length !== 0) {
			failures.push(`${target}: ${result.diagnostics.join(' | ')}`);
		}
		if (result.acknowledgements !== count + 2 || result.completions !== count + 2) {
			failures.push(
				`${target}: received ${result.acknowledgements} acknowledgements and ${result.completions} completions, expected ${count + 2} of each.`,
			);
		}
		if (result.finalVersion !== count + 2 || result.finalId !== `queued-${count - 1}`) {
			failures.push(
				`${target}: finished at version ${result.finalVersion ?? 'missing'} with id ${JSON.stringify(result.finalId)}, expected version ${count + 2} and id ${JSON.stringify(`queued-${count - 1}`)}.`,
			);
		}
	}
	for (const count of reentrantCommitCases) {
		validateReentrantCommits(count, workload.runReentrantCommits(count));
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		const ordered =
			iteration % 2 === 0 ? reentrantCommitCases : [...reentrantCommitCases].reverse();
		for (const count of ordered) {
			const result = workload.runReentrantCommits(count);
			validateReentrantCommits(count, result);
			const target = record(
				`octane-lynx-reentrant-${count / 1_000}k`,
				'drain_ms',
				result.durationMs,
			);
			target.meta = {
				acknowledgements: result.acknowledgements,
				completions: result.completions,
				finalId: result.finalId,
				finalVersion: result.finalVersion,
			};
		}
	}

	const frameworks = [
		{ name: 'octane-lynx', workload },
		{ name: 'react-lynx', workload: reactWorkload },
	];
	let referenceClick;
	for (const framework of frameworks) {
		const click = await framework.workload.runClick(100);
		if (click.diagnostics.length !== 0) {
			failures.push(`${framework.name} native_click: ${click.diagnostics.join(' | ')}`);
		}
		if (click.tokens !== 200) {
			failures.push(
				`${framework.name} native_click: installed ${click.tokens} event tokens, expected 200.`,
			);
		}
		if (!click.engineHookInstalled) {
			failures.push(
				`${framework.name} native_click: the background thread installed no publishEvent receiver.`,
			);
		}
		if (!click.handled) {
			failures.push(`${framework.name} native_click: a delivered native tap did not update state.`);
		}
		if (referenceClick === undefined) referenceClick = click;
		else if (
			click.reachableChecksumBefore !== referenceClick.reachableChecksumBefore ||
			click.reachableChecksumAfter !== referenceClick.reachableChecksumAfter ||
			click.reachableChecksums.length !== referenceClick.reachableChecksums.length ||
			click.reachableChecksums.some(
				(checksum, index) => checksum !== referenceClick.reachableChecksums[index],
			)
		) {
			failures.push(
				`${framework.name} native_click: delivered tap produced a different final tree.`,
			);
		}
		targets.get(framework.name).meta.nativeClick = click;
	}
	targets.get('react-lynx').meta.version = reactWorkload.version;
	targets.get('react-lynx').meta.backend = 'production-compiled-snapshot';

	await samplePhase('cold');

	// Count work once per Octane variant and scenario. Counting wraps every
	// Element PAPI global, so it never shares a run with a timing sample.
	for (const scenario of cases) {
		for (const variant of variants) {
			if (!variant.cases.includes(scenario) || variant.count === undefined) continue;
			const result = await variant.count(scenario);
			validate(variant, scenario, result);
			recordCounters(variant, scenario, result);
		}
	}

	// Minified bytes of the fixture graph per thread, deterministic for a commit.
	const bytesTarget = targetOf('octane-lynx-bytes');
	for (const [thread, sizes] of Object.entries(await measureLynxRenderFixtureBytes(tempDir))) {
		const prefix = thread === 'main-thread' ? 'main' : thread;
		for (const [metric, value] of Object.entries(sizes)) {
			bytesTarget.ops.set(`${prefix}_${metric}`, value);
		}
	}

	payload = {
		suite: 'lynx-render',
		iterations,
		environment: {
			node: process.version,
			platform: `${process.platform}-${process.arch}`,
			cpu: os.cpus()[0]?.model ?? 'unknown',
			reactLynx: reactWorkload.version,
		},
		targets: [...targets].map(([name, target]) => ({
			name,
			ops: Object.fromEntries(
				[...target.ops].map(([op, value]) => [
					op,
					Array.isArray(value) ? timingStat(value) : countStat(value),
				]),
			),
			meta: target.meta,
		})),
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};

	for (const target of payload.targets) {
		for (const [op, stat] of Object.entries(target.ops)) {
			console.log(
				typeof stat.score === 'number'
					? `${target.name} ${op}: median ${stat.median.toFixed(1)}ms ` +
							`(min ${stat.min.toFixed(1)}ms, rme ${stat.rme.toFixed(1)}%)`
					: `${target.name} ${op}: ${stat.median.toLocaleString('en-US')}`,
			);
		}
		if (target.name === 'octane-lynx') {
			for (const scenario of cases) {
				if (scenario.rows === null) continue;
				const transport = target.meta[scenario.op]?.transport;
				if (transport !== undefined) {
					console.log(
						`${target.name} ${scenario.op}: ${transport.commands} wire commands, ` +
							`${transport.programCommands} rows in ${transport.programRuns} compiled program run, ` +
							`${transport.templateNodes} template hosts, ` +
							`${transport.sharedPrograms} shared program, ` +
							`${transport.compactAcknowledgements} compact acknowledgement, ` +
							`${target.meta[scenario.op].privateSelectors} private selectors`,
					);
				}
			}
		}
	}
	for (const framework of frameworks) {
		const click = targets.get(framework.name).meta.nativeClick;
		console.log(
			`${framework.name} native click: ${click.tokens} tokens, handler ${click.handled ? 'ran' : 'DID NOT RUN'}`,
		);
	}
	if (failures.length !== 0) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'lynx-render', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	reactWorkload?.dispose();
	if (!process.env.LYNX_BENCH_KEEP_BUNDLE) fs.rmSync(tempDir, { recursive: true, force: true });
	else console.log(`bundles: ${tempDir}`);
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
