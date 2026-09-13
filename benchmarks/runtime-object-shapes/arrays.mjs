// Actual production-runtime array diagnostics and narrowly scoped cost probes.
// Structural probes instrument a separate bundle and are never timed. Timings
// use the untouched bundle, no V8 intrinsics, and do not measure heap bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { transformSync, version as esbuildVersion } from 'esbuild';

const args = process.argv.slice(2);
const value = (name) => {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
};
const child = args.includes('--child');
const timing = args.includes('--timing');
const marker = 'OCTANE_ARRAYS=';

function exercise(runtime, timed, memoOnly = false) {
	const check = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const shape = timed
		? null
		: new Function(
				'array',
				`return {
		length: array.length, ownEntries: Object.keys(array).length,
		holey: %HasHoleyElements(array), packed: %HasFastPackedElements(array),
		doubles: %HasDoubleElements(array), objects: %HasObjectElements(array)
	}`,
			);
	const object = { value: 1 };
	const namespaces = [
		'http://www.w3.org/1999/xhtml',
		'http://www.w3.org/2000/svg',
		'http://www.w3.org/1998/Math/MathML',
	];
	function record(token) {
		const result = Object.getOwnPropertySymbols(token)
			.map((key) => token[key])
			.find((entry) => entry && entry.html === '<a>value</a>');
		check(result !== undefined, 'Expected actual lazy template record');
		return result;
	}
	function mountTemplate(token, ns) {
		const container = document.createElementNS(namespaces[ns], ['div', 'svg', 'math'][ns]);
		document.body.appendChild(container);
		const root = runtime.createRoot(container);
		try {
			root.render((props, scope) => {
				runtime.bag0(scope, runtime.clone(token));
			});
			check(container.querySelector('a')?.namespaceURI === namespaces[ns], 'Wrong namespace');
		} finally {
			root.unmount();
			container.remove();
		}
	}
	if (!timed) {
		const memo = [];
		for (const size of [2, 4, 8, 16, 32, 128]) {
			const cells = runtime.hookMemoCreate(size);
			const initial = shape(cells);
			runtime.hookMemoPublish0(cells, 0, object);
			check(cells[0] === true && cells[1] === object, 'Memo publication failed');
			memo.push({ size, initial, published: shape(cells) });
		}
		const token = runtime.template('<a>value</a>', 3);
		const parsed = record(token).parsed;
		const template = [{ stage: 'unparsed', ...shape(parsed) }];
		for (const ns of [2, 1, 0, 2]) {
			mountTemplate(token, ns);
			template.push({ stage: ['html', 'svg', 'math'][ns], ...shape(parsed) });
		}
		const list = [];
		for (const type of ['string', 'number', 'object', 'undefined']) {
			const keys = Array.from({ length: 6 }, (_, i) =>
				type === 'object'
					? { i }
					: type === 'number'
						? i
						: type === 'undefined' && i === 1
							? undefined
							: String(i),
			);
			const rows = keys.map((key, i) => ({ key, label: String(i) }));
			const container = document.createElement('div');
			document.body.appendChild(container);
			const root = runtime.createRoot(container);
			function App(props, scope) {
				const parent = runtime.hostComponent(scope, 0, 'div', null);
				runtime.forBlock(
					scope,
					1,
					parent,
					props.rows,
					(row) => row.key,
					(row, itemScope) => {
						runtime.hostComponent(itemScope, 0, 'input', { defaultValue: row.label });
					},
				);
			}
			try {
				root.render(App, { rows });
				const before = [...container.querySelectorAll('input')];
				before.forEach((input) => {
					input.value = 'typed:' + input.value;
				});
				const order = [0, 3, 1, 4, 2, 5];
				globalThis.__octaneArrayKeys = null;
				runtime.flushSync(() => root.render(App, { rows: order.map((i) => rows[i]) }));
				const after = [...container.querySelectorAll('input')];
				order.forEach((old, i) =>
					check(
						after[i] === before[old] && after[i].value === 'typed:' + old,
						'Lost list survivor',
					),
				);
				const collected = globalThis.__octaneArrayKeys;
				check(collected?.length === 4, 'General keyed middle was not captured');
				check(
					collected.every((key, i) => key === keys[order[i + 1]]),
					'Collected keys differ',
				);
				list.push({ type, ...shape(collected) });
			} finally {
				root.unmount();
				container.remove();
			}
		}
		const alternatives = [
			['fill undefined', () => new Array(8).fill(undefined)],
			[
				'push undefined',
				() => {
					const a = [];
					for (let i = 0; i < 8; i++) a.push(undefined);
					return a;
				},
			],
			['fill null', () => new Array(8).fill(null)],
			[
				'push null',
				() => {
					const a = [];
					for (let i = 0; i < 8; i++) a.push(null);
					return a;
				},
			],
		].map(([name, create]) => {
			const a = create();
			const initial = shape(a);
			a[0] = true;
			a[1] = object;
			return { name, initial, published: shape(a) };
		});
		return { memo, template, list, alternatives };
	}
	// Keep created objects reachable across each timed batch; compare source
	// operations rather than claiming these durations isolate allocator cost.
	const ring = new Array(256);
	let checksum = 0;
	function measure(name, count, operation) {
		for (let i = 0; i < Math.min(count, 5000); i++) operation(i);
		const samplesMs = [];
		for (let repeat = 0; repeat < 9; repeat++) {
			const start = performance.now();
			for (let i = 0; i < count; i++) operation(i);
			samplesMs.push(performance.now() - start);
		}
		const ordered = [...samplesMs].sort((a, b) => a - b);
		return { name, iterations: count, samplesMs, medianMs: ordered[4] };
	}
	const measurements = [];
	for (const size of [2, 4, 8, 16, 32, 128]) {
		measurements.push(
			measure('memo-create-publish-' + size, 100000, (i) => {
				const cells = runtime.hookMemoCreate(size);
				runtime.hookMemoPublish0(cells, 0, object);
				ring[i & 255] = cells;
				checksum += cells[0] === true && cells[1] === object ? 1 : 0;
			}),
		);
	}
	if (memoOnly) {
		globalThis.__octaneArrayBenchmarkSink = ring;
		check(checksum > 0, 'Missing timed checksum');
		return { measurements, checksum };
	}
	measurements.push(
		measure('template-create', 100000, (i) => {
			ring[i & 255] = runtime.template('<a>value</a>', 3);
		}),
	);
	for (const ns of [0, 1, 2]) {
		measurements.push(
			measure('template-first-clone-' + ns, 1000, (i) => {
				const token = runtime.template('<a>value</a>', ns);
				ring[i & 255] = runtime.clone(token);
			}),
		);
		const token = runtime.template('<a>value</a>', ns);
		runtime.clone(token);
		measurements.push(
			measure('template-cached-clone-' + ns, 10000, (i) => {
				ring[i & 255] = runtime.clone(token);
			}),
		);
	}
	globalThis.__octaneArrayBenchmarkSink = ring;
	check(checksum > 0, 'Missing timed checksum');
	return { measurements, checksum };
}

if (child) {
	const { JSDOM } = await import('jsdom');
	const { window } = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'CharacterData',
		'Comment',
		'Text',
		'Event',
		'MouseEvent',
		'CustomEvent',
		'MutationObserver',
	]) {
		globalThis[name] = name === 'window' ? window : window[name];
	}
	const runtime = await import(pathToFileURL(value('--bundle')).href);
	const report = {
		node: process.version,
		v8: process.versions.v8,
		...exercise(runtime, timing, args.includes('--memo-only')),
	};
	process.stdout.write(marker + JSON.stringify(report) + '\n');
	window.close();
} else {
	assert(
		args.length >= 2,
		'Usage: node arrays.mjs <baseline-runtime.mjs> <candidate-runtime.mjs> [--chromium <executable>] [--timing] [--memo-only] [--rounds <count>] [--output <json>]',
	);
	const rounds = Number(value('--rounds') ?? 1);
	assert(Number.isInteger(rounds) && rounds > 0, '--rounds must be a positive integer');
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-array-shapes-'));
	try {
		const runs = [];
		// Each variant gets a fresh engine process/profile. Alternating the order
		// across rounds makes drift visible in the retained per-run samples.
		const ordered = Array.from({ length: rounds }, (_, round) =>
			(round % 2 === 0 ? [0, 1] : [1, 0]).map((index) => ({ round, index, supplied: args[index] })),
		).flat();
		for (const { round, index, supplied } of ordered) {
			const bundle = path.resolve(supplied);
			const source = fs.readFileSync(bundle, 'utf8');
			let executable = source;
			if (!timing) {
				const point = /\n  const newKeys = [^\n]+;\n  const newKeysToIdx = /g;
				assert.equal(
					[...source.matchAll(point)].length,
					1,
					'Expected one production keyed-array capture point',
				);
				executable = source.replace(point, (match) =>
					match.replace(
						'\n  const newKeysToIdx',
						'\n  globalThis.__octaneArrayKeys = newKeys;\n  const newKeysToIdx',
					),
				);
			}
			let result;
			if (args.includes('--chromium')) {
				const script = transformSync(executable, {
					format: 'iife',
					globalName: 'OCTANE_RUNTIME',
					target: 'esnext',
				}).code;
				const html = path.join(temporary, `run-${index}.html`);
				fs.writeFileSync(
					html,
					'<!doctype html><body><script>' +
						script.replaceAll('</script', '<\\/script') +
						'</script><script>' +
						`try { document.body.textContent = ${JSON.stringify(marker)} + JSON.stringify({ userAgent: navigator.userAgent, ...(${exercise.toString()})(OCTANE_RUNTIME, ${timing}, ${args.includes('--memo-only')}) }); } catch (error) { document.body.textContent = 'ARRAY_PROBE_ERROR=' + error.stack; }` +
						'</script>',
				);
				const flags = [
					'--no-sandbox',
					'--no-first-run',
					'--disable-gpu',
					'--disable-background-networking',
					`--user-data-dir=${path.join(temporary, 'profile-' + round + '-' + index)}`,
				];
				if (!timing) flags.push('--js-flags=--allow-natives-syntax');
				result = spawnSync(
					value('--chromium'),
					[...flags, '--dump-dom', pathToFileURL(html).href],
					{ encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
				);
			} else {
				const file = path.join(temporary, `runtime-${index}.mjs`);
				fs.writeFileSync(file, executable);
				const flags = timing ? [] : ['--allow-natives-syntax'];
				result = spawnSync(
					process.execPath,
					[
						...flags,
						fileURLToPath(import.meta.url),
						'--child',
						'--bundle',
						file,
						...(timing ? ['--timing'] : []),
						...(args.includes('--memo-only') ? ['--memo-only'] : []),
					],
					{ encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
				);
			}
			assert.equal(result.status, 0, result.stderr || result.error?.message);
			const escaped = result.stdout.match(/OCTANE_ARRAYS=(\{[^\n]*\})/);
			assert(escaped, result.stdout + result.stderr);
			const report = JSON.parse(
				escaped[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'),
			);
			runs.push({
				round,
				variant: index === 0 ? 'baseline' : 'candidate',
				bundle,
				sha256: createHash('sha256').update(source).digest('hex'),
				...report,
			});
		}
		const report = {
			mode: timing ? 'untouched-bundle-timing' : 'instrumented-structural-diagnostic',
			esbuildVersion,
			runs,
		};
		const json = JSON.stringify(report, null, 2) + '\n';
		if (args.includes('--output')) fs.writeFileSync(path.resolve(value('--output')), json);
		process.stdout.write(json);
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
