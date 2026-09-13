// Observe reached runtime setters on clean and instrumented public host renders.
// No timing claims: these counters describe source work, not engine allocations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import ts from 'typescript';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeFile = path.resolve(process.argv[2] ?? runtimePath);
const source = fs.readFileSync(runtimeFile, 'utf8');
const setters = {
	setAttribute: 'attributes',
	setDeoptClass: 'classes',
	setEventHandler: 'events',
	setStyle: 'styles',
};
const ast = ts.createSourceFile(runtimePath, source, ts.ScriptTarget.Latest, true);
const edits = [];
for (const node of ast.statements) {
	if (!ts.isFunctionDeclaration(node) || !node.body || !setters[node.name?.text]) continue;
	edits.push([
		node.body.getStart(ast) + 1,
		`globalThis.__hostPropWork.${setters[node.name.text]}++;`,
	]);
}
assert.equal(edits.length, Object.keys(setters).length);
let observedSource = source;
for (const [offset, insertion] of edits.sort((a, b) => b[0] - a[0]))
	observedSource = observedSource.slice(0, offset) + insertion + observedSource.slice(offset);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-descriptor-props-'));
const window = new Window();
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'HTMLInputElement',
	'SVGElement',
	'Text',
	'Comment',
	'Event',
	'MouseEvent',
	'MutationObserver',
])
	globalThis[name] = name === 'window' ? window : window[name];
const emptyWork = () => ({ attributes: 0, classes: 0, events: 0, styles: 0, attribute_reads: 0 });
const getAttribute = window.Element.prototype.getAttribute;
window.Element.prototype.getAttribute = function (name) {
	if (globalThis.__hostPropWork !== undefined) globalThis.__hostPropWork.attribute_reads++;
	return getAttribute.call(this, name);
};
let cleanSnapshot;
let size;
const phases = {};
try {
	for (const observed of [false, true]) {
		const outfile = path.join(scratch, `${observed}.mjs`);
		const bundle = await build({
			stdin: {
				contents: 'export { createRoot, flushSync, hostComponent } from "octane";',
				resolveDir: repo,
				loader: 'js',
			},
			outfile,
			bundle: true,
			format: 'esm',
			platform: 'node',
			minify: true,
			write: false,
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: [
				{
					name: 'selected-runtime',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane$/ }, () => ({
							path: path.join(repo, 'packages/octane/src/index.ts'),
						}));
						plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
							loaded === runtimePath
								? {
										contents: observed ? observedSource : source,
										loader: 'ts',
										resolveDir: path.dirname(runtimePath),
									}
								: null,
						);
					},
				},
			],
		});
		const bytes = bundle.outputFiles[0].contents;
		if (!observed) size = { minified: bytes.length, gzip: gzipSync(bytes).length };
		fs.writeFileSync(outfile, bytes);
		const runtime = await import(pathToFileURL(outfile));
		const Host = ({ props }, scope) => {
			runtime.hostComponent(scope, 0, 'button', props);
		};
		const container = document.createElement('main');
		document.body.append(container);
		const root = runtime.createRoot(container);
		const calls = [];
		const click = () => calls.push('click');
		const props = { id: 'host', title: 'same', role: 'button', className: 'same', onClick: click };
		for (let i = 0; i < 24; i++) props['data-field-' + i] = 'same:' + i;
		globalThis.__hostPropWork = emptyWork();
		root.render(Host, { props });
		const button = container.querySelector('button');
		button.focus();
		const snapshot = [];
		for (const phase of ['same', 'changed', 'foreign']) {
			globalThis.__hostPropWork = emptyWork();
			for (let i = 0; i < 128; i++) {
				const next = { ...props };
				if (phase === 'changed') {
					next.title = 'changed:' + i;
					next.className = 'changed:' + i;
				}
				if (phase === 'foreign') {
					button.title = 'foreign';
					button.className = 'foreign';
					button.setAttribute('data-field-0', 'foreign');
				}
				runtime.flushSync(() => root.render(Host, { props: next }));
			}
			if (observed) phases[phase] = { ...globalThis.__hostPropWork };
			assert.equal(container.querySelector('button'), button);
			assert.equal(document.activeElement, button);
			assert.equal(button.title, phase === 'changed' ? 'changed:127' : 'same');
			assert.equal(button.className, phase === 'changed' ? 'changed:127' : 'same');
			assert.equal(button.getAttribute('data-field-0'), 'same:0');
			button.click();
			snapshot.push(button.outerHTML);
		}
		assert.deepEqual(calls, ['click', 'click', 'click']);
		root.unmount();
		assert.equal(container.innerHTML, '');
		container.remove();
		if (observed) assert.deepEqual(snapshot, cleanSnapshot, 'observer changed host semantics');
		else cleanSnapshot = snapshot;
	}
	const val = (score) => ({ score, median: score, min: score, samples: 1 });
	const ops = Object.fromEntries(
		Object.entries(phases).flatMap(([phase, counts]) =>
			Object.entries(counts).map(([name, count]) => [`${phase}_${name}`, val(count)]),
		),
	);
	ops.bundle_minified = val(size.minified);
	ops.bundle_gzip = val(size.gzip);
	const references = Object.fromEntries(Object.keys(ops).map((key) => [key, val(128)]));
	const metadata = {
		node: process.version,
		runtime: runtimeFile,
		sha256: createHash('sha256').update(source).digest('hex'),
		repeats: 128,
		phases,
		size,
		semantics: cleanSnapshot,
	};
	const report = {
		suite: 'descriptor-renderer',
		targets: [
			{ name: 'props', ops, meta: metadata },
			{ name: 'props-one-per-update', ops: references },
		],
		meta: metadata,
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
