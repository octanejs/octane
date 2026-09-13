// Actual runtime parse/allocation sites, with clean/observed native-event controls.
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
const catalogPath = path.join(repo, 'packages/octane/src/event-names.js');
const catalogSource = fs.readFileSync(catalogPath, 'utf8');
const ast = ts.createSourceFile(runtimePath, source, ts.ScriptTarget.Latest, true);
const insertions = [];
const sites = {
	parse_records: 0,
	substrings: 0,
	delegate_arrays: 0,
	cache_inserts: 0,
	cache_probes: 0,
};
function observe(node, kind) {
	sites[kind]++;
	insertions.push(
		[node.getStart(ast), `(globalThis.__descriptorEventWork.${kind}++, `],
		[node.end, ')'],
	);
}
for (const fn of ast.statements) {
	if (!ts.isFunctionDeclaration(fn) || !fn.body) continue;
	const name = fn.name?.text;
	if (!['eventSlot', 'applyDeoptProp', 'applyHostProps'].includes(name)) continue;
	function visit(node) {
		if (name === 'eventSlot') {
			if (ts.isObjectLiteralExpression(node)) {
				const names = node.properties.map((prop) => prop.name?.getText(ast));
				if (['type', 'key', 'capture'].every((key) => names.includes(key)))
					observe(node, 'parse_records');
			}
			if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				if (node.expression.name.text === 'slice') observe(node, 'substrings');
				if (node.expression.name.text === 'set') observe(node, 'cache_inserts');
				if (node.expression.name.text === 'get') observe(node, 'cache_probes');
			}
		}
		if (
			ts.isCallExpression(node) &&
			['delegateEvents', 'delegateCaptureEvents'].includes(node.expression.getText(ast))
		) {
			const argument = node.arguments[0];
			if (ts.isArrayLiteralExpression(argument) && argument.elements.length === 1)
				observe(argument, 'delegate_arrays');
		}
		ts.forEachChild(node, visit);
	}
	visit(fn.body);
}
assert.equal(sites.parse_records, 1, 'one actual parsed event-record creation site');
assert.equal(sites.substrings, 2, 'event name and capture-suffix slices');
assert.equal(sites.delegate_arrays, 4, 'bubble/capture array sites in both host paths');
let observedSource = source;
for (const [offset, text] of insertions.sort((a, b) => b[0] - a[0]))
	observedSource = observedSource.slice(0, offset) + text + observedSource.slice(offset);
const catalogAst = ts.createSourceFile(catalogPath, catalogSource, ts.ScriptTarget.Latest, true);
const catalogInsertions = [];
const catalogSites = { catalog_checks: 0, catalog_entries: 0, catalog_splits: 0 };
function visitCatalog(node) {
	if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
		const kind = { has: 'catalog_checks', add: 'catalog_entries', split: 'catalog_splits' }[
			node.expression.name.text
		];
		if (kind) {
			catalogSites[kind]++;
			catalogInsertions.push(
				[node.getStart(catalogAst), `(globalThis.__descriptorEventWork.${kind}++, `],
				[node.end, ')'],
			);
		}
	}
	ts.forEachChild(node, visitCatalog);
}
visitCatalog(catalogAst);
assert.deepEqual(catalogSites, { catalog_checks: 1, catalog_entries: 2, catalog_splits: 1 });
let observedCatalog = catalogSource;
for (const [offset, text] of catalogInsertions.sort((a, b) => b[0] - a[0]))
	observedCatalog = observedCatalog.slice(0, offset) + text + observedCatalog.slice(offset);
const entry = 'export {createRoot,createElement,flushSync,hostComponent} from "octane";';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-descriptor-events-'));
const emptyWork = () => ({
	parse_records: 0,
	substrings: 0,
	delegate_arrays: 0,
	cache_inserts: 0,
	cache_probes: 0,
	catalog_checks: 0,
	catalog_entries: 0,
	catalog_splits: 0,
});
const count = 128,
	updates = 8;
const records = [];
let size;
try {
	for (const observed of [false, true]) {
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
			'customElements',
		])
			globalThis[name] = name === 'window' ? window : window[name];
		try {
			const outfile = path.join(scratch, `${observed}.mjs`);
			const bundle = await build({
				stdin: { contents: entry, resolveDir: repo, loader: 'js' },
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
							plugin.onLoad({ filter: /\/event-names\.js$/ }, ({ path: loaded }) =>
								loaded === catalogPath
									? { contents: observed ? observedCatalog : catalogSource, loader: 'js' }
									: null,
							);
						},
					},
				],
			});
			const bytes = bundle.outputFiles[0].contents;
			fs.writeFileSync(outfile, bytes);
			if (!observed) size = { minified: bytes.length, gzip: gzipSync(bytes).length };
			const { createRoot, createElement, flushSync, hostComponent } = await import(
				pathToFileURL(outfile)
			);
			const phases = {};
			for (const mode of [
				'non-event',
				'descriptor-known',
				'host-known',
				'descriptor-unknown',
				'custom-known-and-unknown',
			]) {
				const calls = [];
				const tag = mode === 'custom-known-and-unknown' ? 'descriptor-native-event-host' : 'button';
				function properties(version, index) {
					const props = { 'data-row': String(index), title: String(version) };
					const handler = (label) => () => calls.push(`${label}:${version}:${index}`);
					if (mode.endsWith('-known'))
						Object.assign(props, {
							onClick: handler('click-bubble'),
							onClickCapture: handler('click-capture'),
							onDoubleClick: handler('double-bubble'),
							onDoubleClickCapture: handler('double-capture'),
							onGotPointerCapture: handler('pointer-bubble'),
							onGotPointerCaptureCapture: handler('pointer-capture'),
						});
					else if (mode === 'descriptor-unknown')
						Object.assign(props, {
							onAuditEvent: handler('audit'),
							onDblClick: handler('double-alias'),
						});
					else if (mode === 'custom-known-and-unknown')
						Object.assign(props, {
							onClick: handler('click-bubble'),
							onClickCapture: handler('click-capture'),
							onAuditEvent: handler('custom'),
							onDblClick: handler('custom-alias'),
						});
					return props;
				}
				function App({ version }, scope) {
					if (mode === 'host-known') {
						for (let index = 0; index < count; index++)
							hostComponent(scope, index, tag, properties(version, index));
						return;
					}
					return createElement(
						'section',
						null,
						Array.from({ length: count }, (_, index) =>
							createElement(tag, { key: index, ...properties(version, index) }),
						),
					);
				}
				const container = document.createElement('main');
				document.body.append(container);
				const root = createRoot(container);
				globalThis.__descriptorEventWork = emptyWork();
				root.render(App, { version: 0 });
				flushSync(() => {});
				const initial = Array.from(container.querySelectorAll('[data-row]'));
				assert.equal(initial.length, count);
				phases[`${mode}-mount`] = {
					work: { ...globalThis.__descriptorEventWork },
					reference: count,
				};
				globalThis.__descriptorEventWork = emptyWork();
				for (let version = 1; version <= updates; version++)
					flushSync(() => root.render(App, { version }));
				phases[`${mode}-updates`] = {
					work: { ...globalThis.__descriptorEventWork },
					reference: count * updates,
				};
				assert.deepEqual(Array.from(container.querySelectorAll('[data-row]')), initial);
				for (const index of [0, count - 1]) {
					const element = initial[index];
					assert.equal(element.title, String(updates));
					if (mode.endsWith('-known')) {
						element.dispatchEvent(new Event('click', { bubbles: true }));
						element.dispatchEvent(new Event('dblclick', { bubbles: true }));
						element.dispatchEvent(new Event('gotpointercapture', { bubbles: true }));
						assert.deepEqual(
							calls.splice(0),
							[
								'click-capture',
								'click-bubble',
								'double-capture',
								'double-bubble',
								'pointer-capture',
								'pointer-bubble',
							].map((name) => `${name}:${updates}:${index}`),
						);
					} else if (mode === 'descriptor-unknown') {
						element.dispatchEvent(new Event('auditevent', { bubbles: true }));
						element.dispatchEvent(new Event('dblclick', { bubbles: true }));
						assert.deepEqual(
							calls.splice(0),
							['audit', 'double-alias'].map((name) => `${name}:${updates}:${index}`),
						);
					} else if (mode === 'custom-known-and-unknown') {
						element.dispatchEvent(new Event('click', { bubbles: true }));
						element.dispatchEvent(new Event('auditevent', { bubbles: true }));
						element.dispatchEvent(new Event('AuditEvent', { bubbles: true }));
						element.dispatchEvent(new Event('dblclick', { bubbles: true }));
						element.dispatchEvent(new Event('DblClick', { bubbles: true }));
						assert.deepEqual(
							calls.splice(0),
							['click-capture', 'click-bubble', 'custom', 'custom-alias'].map(
								(name) => `${name}:${updates}:${index}`,
							),
						);
					} else {
						element.dispatchEvent(new Event('click', { bubbles: true }));
						assert.deepEqual(calls, []);
					}
				}
				for (const phase of ['mount', 'updates'])
					phases[`${mode}-${phase}`].semantic = container.innerHTML;
				root.unmount();
				assert.equal(container.childNodes.length, 0);
				container.remove();
			}
			records.push(phases);
		} finally {
			await window.happyDOM.close();
		}
	}
	const hash = (value) => createHash('sha256').update(value).digest('hex');
	const metadata = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		runtimeFile,
		runtimeSha256: hash(source),
		catalogSha256: hash(catalogSource),
		runnerSha256: hash(fs.readFileSync(import.meta.filename)),
		entrySha256: hash(entry),
		sites,
		catalogSites,
		size,
		count,
		updates,
		measurement: 'Reached parse/slice/array/cache/catalog source sites; no timing or heap claim',
	};
	const value = (median) => ({ score: median, median, min: median, samples: 1 });
	const targets = [];
	for (const [name, result] of Object.entries(records[1])) {
		assert.equal(result.semantic, records[0][name].semantic, 'observer changed ' + name);
		const meta = { ...metadata, gate: 'passed', semanticSha256: hash(result.semantic) };
		targets.push({
			name: `events-${name}`,
			ops: Object.fromEntries(Object.entries(result.work).map(([op, count]) => [op, value(count)])),
			meta,
		});
		targets.push({
			name: `events-${name}-work`,
			ops: Object.fromEntries(Object.keys(result.work).map((op) => [op, value(result.reference)])),
			meta,
		});
	}
	const report = { suite: 'descriptor-renderer', targets, meta: metadata };
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	fs.rmSync(scratch, { recursive: true, force: true });
}
