// A real compiled spill-bag workload compares the shipped generic snapshot with
// an otherwise identical build that gives spill bags a separate spread site.
// Neither variant changes the journal's values, checkpoints, or rollback.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const repo = resolve(import.meta.dirname, '../..');
const sourceRoot = resolve(process.argv[2] || repo);
const sourceFile = join(sourceRoot, 'packages/octane/src/runtime.ts');
const runtimeSource = await readFile(sourceFile, 'utf8');
const { compile } = await import(
	pathToFileURL(join(sourceRoot, 'packages/octane/src/compiler/compile.js'))
);
const output = join(repo, 'node_modules/.cache/root-snapshot-bags');
await mkdir(output, { recursive: true });
const source = `import { useLayoutEffect, use } from 'octane';
function Reader(props) @{ const value = use(props.promise); <output>{value as string}</output> }
export function App(props) @{
  useLayoutEffect(() => { props.effect(props.label); return () => props.cleanup(); }, [props.label]);
  <section>
    ${Array.from({ length: 24 }, (_, index) => `<button title={props.label} onClick={() => props.record(props.label)}>${index}:{props.label as string}</button>`).join('\n')}
    <input value={props.label} />
    <Reader promise={props.promise} />
  </section>
}`;
const compiled = compile(source, 'snapshot-bags.tsrx', { hmr: false, dev: false }).code;
assert.match(compiled, /bagOf/, 'fixture must exceed the fixed-arity bag factories');
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function bundle(variant) {
	const definition = runtimeSource.match(
		/function journalObjectOnce\(obj: object\): void \{[\s\S]*?\n\}/,
	)?.[0];
	assert.ok(definition, 'generic snapshot definition');
	const marker = '\tjournalObjectOnce(bag);';
	assert.equal(runtimeSource.split(marker).length - 1, 1, 'spill-bag call site');
	let edited =
		variant === 'split'
			? runtimeSource.replace(marker, '\tjournalSpillBagOnce(bag);') +
				'\n' +
				definition.replace('journalObjectOnce', 'journalSpillBagOnce')
			: runtimeSource;
	if (variant === 'legacyKeys') {
		const pattern =
			/for \(const key of Reflect\.ownKeys\(target\)\) \{[\s\S]*?for \(const key of Reflect\.ownKeys\(a\)\) \{[\s\S]*?target\[key\] = a\[key\];\n\s*\}/;
		assert.match(edited, pattern, 'cold rollback key enumeration');
		edited = edited.replace(
			pattern,
			`for (const key of Object.keys(target)) {
			if (!Object.prototype.hasOwnProperty.call(a, key)) delete target[key];
		}
		for (const key of Object.keys(a)) target[key] = a[key];`,
		);
	}
	const built = await build({
		stdin: {
			contents: compiled + '\nexport { createRoot, flushSync } from "octane";',
			resolveDir: sourceRoot,
		},
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		minify: true,
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [join(repo, 'packages/octane/node_modules'), join(repo, 'node_modules')],
		plugins: [
			{
				name: 'selected-snapshot-runtime',
				setup(builder) {
					builder.onResolve({ filter: /^octane(?:\/internal\/client)?$/ }, ({ path }) => ({
						path: join(
							sourceRoot,
							'packages/octane/src',
							path === 'octane' ? 'index.ts' : 'internal/client.ts',
						),
					}));
					builder.onLoad({ filter: /\/runtime\.ts$/ }, async ({ path }) =>
						path === sourceFile ? { contents: edited, loader: 'ts' } : undefined,
					);
				},
			},
		],
	});
	const code = built.outputFiles[0].text;
	const path = join(output, hash(code) + '.mjs');
	await writeFile(path, code);
	return { path, minified: Buffer.byteLength(code), gzip: gzipSync(code).length };
}

async function exercise(artifact, id, mode = 'update') {
	const window = new Window({ url: 'http://localhost/' });
	for (const name of [
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Comment',
		'Text',
		'Event',
		'MouseEvent',
		'CustomEvent',
		'MutationObserver',
	])
		globalThis[name] = window[name];
	globalThis.window = window;
	const { App, createRoot, flushSync } = await import(
		pathToFileURL(artifact.path).href + '?run=' + id
	);
	const container = window.document.createElement('div');
	window.document.body.appendChild(container);
	const root = createRoot(container);
	let effects = 0;
	let cleanups = 0;
	let latestEffect;
	let latestEvent;
	const stable = {
		effect: (label) => {
			effects++;
			latestEffect = label;
		},
		cleanup: () => {
			cleanups++;
		},
		record: (label) => {
			latestEvent = label;
		},
	};
	let tick = 0;
	const ready = { status: 'fulfilled', value: 'ready', then() {} };
	const pending = new Promise(() => {});
	root.render(App, { ...stable, label: String(tick), promise: ready });
	flushSync(() => {});
	const buttons = [...container.querySelectorAll('button')];
	function render() {
		flushSync(() =>
			root.render(App, {
				...stable,
				label: String(++tick),
				promise: mode === 'hold' ? pending : ready,
			}),
		);
	}
	for (let warmup = 0; warmup < 256; warmup++) render();
	const samples = [];
	for (let sample = 0; sample < 16; sample++) {
		const start = performance.now();
		for (let iteration = 0; iteration < 128; iteration++) render();
		samples.push((performance.now() - start) / 128);
	}
	const accepted = mode === 'hold' ? '0' : String(tick);
	for (const [index, button] of buttons.entries()) {
		assert.equal(container.querySelectorAll('button')[index], button, 'accepted button identity');
		assert.equal(button.textContent, `${index}:${accepted}`);
		assert.equal(button.title, accepted);
		button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
		assert.equal(latestEvent, accepted, 'accepted handler environment');
	}
	assert.equal(container.querySelector('input').value, accepted);
	assert.equal(latestEffect, accepted);
	assert.equal(effects, cleanups + 1);
	const semantic = { label: accepted, buttons: buttons.length, effects, cleanups };
	root.unmount();
	assert.equal(container.childNodes.length, 0);
	assert.equal(effects, cleanups);
	await window.happyDOM.close();
	return { medianMs: [...samples].sort((a, b) => a - b)[samples.length / 2], samples, semantic };
}
const artifacts = {
	baseline: await bundle('baseline'),
	split: await bundle('split'),
	legacyKeys: await bundle('legacyKeys'),
};
const rounds = [];
for (const mode of ['update', 'hold']) {
	const order =
		mode === 'update'
			? ['baseline', 'split', 'split', 'baseline']
			: ['legacyKeys', 'baseline', 'baseline', 'legacyKeys'];
	const results = [];
	for (const [index, variant] of order.entries())
		results.push({ mode, variant, ...(await exercise(artifacts[variant], mode + index, mode)) });
	assert.deepEqual(
		results.map((round) => round.semantic),
		Array(4).fill(results[0].semantic),
	);
	rounds.push(...results);
}
console.log(
	JSON.stringify(
		{
			node: process.version,
			sourceRoot,
			runtimeSha256: hash(runtimeSource),
			workloadSha256: hash(source),
			artifacts,
			rounds,
		},
		null,
		2,
	),
);
