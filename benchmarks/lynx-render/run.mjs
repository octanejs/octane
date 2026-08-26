// Node-only timing benchmark comparing compiled Octane and ReactLynx.
//
// It bundles the real background root, async transport, main-thread receiver,
// and host driver with the real Octane compiler, then drives them through a
// identical cheap fake Element PAPI. ReactLynx runs its published production
// Snapshot compiler, runtime, background render, and real main-thread patch.
// This makes no native paint, layout, adoption, or device claim.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

import { octane } from '../../packages/octane/src/compiler/vite.js';
import { lynxRenderers } from '../../packages/lynx/src/config.runtime.js';
import { createReactWorkload } from './react-workload.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const rawIterations = process.argv[2] ?? '5';
const iterations = Number(rawIterations);

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const LYNX_SOURCE = path.join(REPO, 'packages/lynx/src');
const OCTANE_SOURCE = path.join(REPO, 'packages/octane/src');

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

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-render-'));
let payload;
let reactWorkload;

try {
	await build({
		configFile: false,
		root: REPO,
		logLevel: 'silent',
		resolve: {
			alias: [
				{ find: /^@octanejs\/lynx$/, replacement: path.join(LYNX_SOURCE, 'index.ts') },
				{
					find: /^@octanejs\/lynx\/intrinsics\/jsx-runtime$/,
					replacement: path.join(LYNX_SOURCE, 'intrinsics.ts'),
				},
				{ find: /^@octanejs\/lynx\/(.*)$/, replacement: `${LYNX_SOURCE}/$1.ts` },
				{
					find: /^octane\/universal\/native$/,
					replacement: path.join(OCTANE_SOURCE, 'universal-native.ts'),
				},
				{ find: /^octane\/universal$/, replacement: path.join(OCTANE_SOURCE, 'universal.ts') },
				{ find: /^octane$/, replacement: path.join(OCTANE_SOURCE, 'index.ts') },
			],
		},
		plugins: [octane({ renderers: lynxRenderers, ssr: false })],
		define: { 'process.env.NODE_ENV': '"production"' },
		build: {
			write: true,
			minify: false,
			target: 'node22',
			lib: {
				entry: path.join(ROOT, 'workload.ts'),
				formats: ['es'],
				fileName: 'workload',
			},
			outDir: tempDir,
			emptyOutDir: false,
			rollupOptions: { external: [] },
		},
	});

	const workload = await import(pathToFileURL(path.join(tempDir, 'workload.js')).href);
	reactWorkload = await createReactWorkload(workload, tempDir);

	const failures = [];
	const targets = new Map();
	const record = (name, op, value) => {
		let target = targets.get(name);
		if (target === undefined) targets.set(name, (target = { ops: new Map(), meta: {} }));
		let samples = target.ops.get(op);
		if (samples === undefined) target.ops.set(op, (samples = []));
		samples.push(value);
		return target;
	};

	const frameworks = [
		{ name: 'octane-lynx', workload },
		{ name: 'react-lynx', workload: reactWorkload },
	];
	const cases = [
		{ op: 'empty_startup_ms', rows: null, createdElements: 2, eventTokens: 0 },
		{ op: 'create_1k_rows_ms', rows: 1_000, createdElements: 9_008, eventTokens: 2_000 },
		{ op: 'create_10k_rows_ms', rows: 10_000, createdElements: 90_008, eventTokens: 20_000 },
		{ op: 'update_1k_rows_ms', rows: 1_000, createdElements: 9_008, eventTokens: 2_000 },
		{ op: 'update_10k_rows_ms', rows: 10_000, createdElements: 90_008, eventTokens: 20_000 },
	];
	const referenceChecksums = new Map();

	function validate(name, scenario, result) {
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
		if (name === 'octane-lynx' && scenario.rows !== null) {
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
		const reference = referenceChecksums.get(scenario.op);
		if (reference === undefined) referenceChecksums.set(scenario.op, result.reachableChecksum);
		else if (reference !== result.reachableChecksum) {
			failures.push(
				`${name} ${scenario.op}: visible-tree checksum ${result.reachableChecksum} differs from ${reference}.`,
			);
		}
	}

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

	function run(framework, scenario) {
		if (scenario.rows === null) return framework.workload.runEmptyStartup();
		return scenario.op.startsWith('update_')
			? framework.workload.runUpdateRows(scenario.rows)
			: framework.workload.runCreateRows(scenario.rows);
	}

	// Warm both production-compiled frameworks once per scenario and reject
	// allocation-only/no-op runs before recording any timing sample.
	for (const scenario of cases) {
		for (const framework of frameworks) {
			validate(framework.name, scenario, await run(framework, scenario));
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const scenario of cases) {
			// Alternating framework order limits steady-state/JIT and GC bias.
			const ordered = iteration % 2 === 0 ? frameworks : [...frameworks].reverse();
			for (const framework of ordered) {
				const result = await run(framework, scenario);
				validate(framework.name, scenario, result);
				const target = record(framework.name, scenario.op, result.durationMs);
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

	const reentrantCommitCases = [10_000, 20_000];
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

	payload = {
		suite: 'lynx-render',
		iterations,
		targets: [...targets].map(([name, target]) => ({
			name,
			ops: Object.fromEntries([...target.ops].map(([op, samples]) => [op, timingStat(samples)])),
			meta: target.meta,
		})),
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};

	for (const target of payload.targets) {
		for (const [op, stat] of Object.entries(target.ops)) {
			console.log(
				`${target.name} ${op}: median ${stat.median.toFixed(1)}ms ` +
					`(min ${stat.min.toFixed(1)}ms, rme ${stat.rme.toFixed(1)}%)`,
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
	else console.log(`bundle: ${path.join(tempDir, 'workload.js')}`);
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
