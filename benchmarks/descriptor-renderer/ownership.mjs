import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
const repo = path.resolve(import.meta.dirname, '../..');
process.env.NODE_ENV = 'production';
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeFile = path.resolve(process.argv[2] ?? runtimePath);
const source = fs.readFileSync(runtimeFile, 'utf8');
const ast = ts.createSourceFile(runtimePath, source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(
	(n) => ts.isFunctionDeclaration(n) && n.name?.text === 'setDeoptDesc',
);
const edits = [];
let snapshotSites = 0;
function visit(node) {
	if (
		ts.isObjectLiteralExpression(node) &&
		node.properties.some((p) => p.name?.getText(ast) === '$$kind')
	) {
		snapshotSites++;
		edits.push([node.getStart(ast), 'globalThis.__scopedAudit.snapshot('], [node.end, ')']);
	}
	if (
		ts.isElementAccessExpression(node) &&
		node.argumentExpression.getText(ast) === 'SCOPED_CHILDREN_RESOLVER'
	)
		edits.push([node.getStart(ast), '(globalThis.__scopedAudit.probes++, '], [node.end, ')']);
	ts.forEachChild(node, visit);
}
visit(fn.body);
edits.push([fn.body.getStart(ast) + 1, 'globalThis.__scopedAudit.calls++;']);
edits.push([
	fn.body.end - 1,
	'globalThis.__scopedAudit.stamps.set(el,(el as Element & DeoptStamped)[DEOPT_DESC]);',
]);
for (const name of [
	'sameDeoptDesc',
	'unchangedScopedHostDescriptor',
	'adoptedDeoptChildren',
	'buildDeoptAdoptQueue',
	'mountItemsLinear',
]) {
	const node = ast.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
	if (!node) continue;
	if (name === 'unchangedScopedHostDescriptor')
		edits.push([node.body.getStart(ast) + 1, 'globalThis.__scopedAudit.bailChecks++;']);
	if (name === 'adoptedDeoptChildren')
		edits.push([node.body.getStart(ast) + 1, 'globalThis.__scopedAudit.adoptionVisits++;']);
	function observe(n, kind) {
		edits.push([n.getStart(ast), `(globalThis.__scopedAudit.${kind}++, `], [n.end, ')']);
	}
	function scan(n) {
		if (
			name === 'unchangedScopedHostDescriptor' &&
			ts.isElementAccessExpression(n) &&
			['SCOPED_VALUE_RECORD', 'SCOPED_CHILDREN_RESOLVER'].includes(
				n.argumentExpression.getText(ast),
			)
		)
			observe(n, 'bailProbes');
		if (name === 'adoptedDeoptChildren' && ts.isArrayLiteralExpression(n))
			observe(n, 'adoptionCopies');
		if (
			name === 'buildDeoptAdoptQueue' &&
			ts.isObjectLiteralExpression(n) &&
			n.properties.some((p) => p.name?.getText(ast) === 'end')
		)
			observe(n, 'adoptionCursors');
		if (
			name === 'mountItemsLinear' &&
			ts.isNewExpression(n) &&
			['Map', 'Set'].includes(n.expression.getText(ast))
		)
			observe(n, n.expression.getText(ast) === 'Map' ? 'adoptionMaps' : 'adoptionSets');
		ts.forEachChild(n, scan);
	}
	scan(node.body);
}
let instrumented = source;
for (const [offset, text] of edits.sort((a, b) => b[0] - a[0]))
	instrumented = instrumented.slice(0, offset) + text + instrumented.slice(offset);
const fixture = fs.readFileSync(
	path.join(repo, 'packages/octane/tests/_fixtures/descriptor-classification.tsrx'),
	'utf8',
);
const compiled = compile(fixture, 'descriptor-classification.tsrx', {
	hmr: false,
	dev: false,
	autoMemo: true,
	inlineHookMemo: true,
}).code;
const adapter = `
import {createRoot,createElement,createScopedElement,flushSync} from 'octane';
export {createRoot,flushSync};
const stableChildren=[createElement('input',{defaultValue:'draft'}),createElement('span',{},'plain')];
const stableHost=createScopedElement('section',{},()=>stableChildren);
const ordinaryBlocks=createElement('section',{},createElement('input',{defaultValue:'draft'}),createElement(Stateful,{}));
export function Ordinary({tick}){return createElement('main',{},Array.from({length:128},(_,index)=>createElement('section',{key:index,title:String(tick)},createElement('input',{defaultValue:'draft'}),createElement('span',{},'plain'))));}
export function OrdinaryBlocks(){return createElement('main',{},Array.from({length:128},()=>ordinaryBlocks));}
export function Stable(){return createElement('main',{},Array.from({length:128},()=>stableHost));}
export function Scoped({first,second,tick}){return Array.from({length:64},(_,index)=>createElement(App,{key:index,first,second,tick}));}
`;
const entry = compiled + '\n' + adapter;
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'scoped-ownership-audit-'));
const records = [];
let size;
const counterNames = [
	'calls',
	'probes',
	'snapshots',
	'bailChecks',
	'bailProbes',
	'adoptionVisits',
	'adoptionCopies',
	'adoptionCursors',
	'adoptionMaps',
	'adoptionSets',
];
const reset = () => {
	for (const key of counterNames) globalThis.__scopedAudit[key] = 0;
};
const count = () => {
	const a = globalThis.__scopedAudit;
	const live = new Set();
	for (const el of document.querySelectorAll('*')) {
		const stamp = a.stamps.get(el);
		if (stamp && a.created.has(stamp)) live.add(stamp);
	}
	const childArrays = new Set(Array.from(live, (s) => s.children).filter(Array.isArray));
	return {
		...Object.fromEntries(counterNames.map((key) => [key, a[key]])),
		liveSnapshots: live.size,
		liveChildArrays: childArrays.size,
		liveChildEntries: Array.from(childArrays).reduce((n, a) => n + a.length, 0),
	};
};
try {
	for (const observed of [false, true]) {
		const window = new Window();
		for (const key of [
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
			globalThis[key] = key === 'window' ? window : window[key];
		globalThis.__scopedAudit = {
			calls: 0,
			probes: 0,
			snapshots: 0,
			stamps: new WeakMap(),
			created: new WeakSet(),
			snapshot(record) {
				this.snapshots++;
				this.created.add(record);
				return record;
			},
		};
		reset();
		try {
			const outfile = path.join(scratch, `${observed}.mjs`);
			const built = await build({
				stdin: { contents: entry, resolveDir: repo, loader: 'js' },
				bundle: true,
				write: false,
				outfile,
				format: 'esm',
				platform: 'node',
				minify: true,
				define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
				plugins: [
					{
						name: 'selected-runtime',
						setup(plugin) {
							plugin.onResolve({ filter: /^octane$/ }, () => ({
								path: path.join(repo, 'packages/octane/src/index.ts'),
							}));
							plugin.onResolve({ filter: /^octane\/internal\/client$/ }, () => ({
								path: path.join(repo, 'packages/octane/src/internal/client.ts'),
							}));
							plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
								loaded === runtimePath
									? {
											contents: observed ? instrumented : source,
											loader: 'ts',
											resolveDir: path.dirname(runtimePath),
										}
									: null,
							);
						},
					},
				],
			});
			const bytes = built.outputFiles[0].contents;
			fs.writeFileSync(outfile, bytes);
			if (!observed) size = { minified: bytes.length, gzip: gzipSync(bytes).length };
			const runtime = await import(pathToFileURL(outfile));
			const phases = {};
			for (const mode of ['Ordinary', 'OrdinaryBlocks', 'Stable', 'Scoped']) {
				const container = document.createElement('div');
				document.body.append(container);
				const root = runtime.createRoot(container);
				const first = false,
					second = true;
				let tick = 0;
				const render = () =>
					runtime.flushSync(() => root.render(runtime[mode], { first, second, tick }));
				const a = globalThis.__scopedAudit;
				reset();
				render();
				const inputs = Array.from(container.querySelectorAll('input'));
				const sections = Array.from(container.querySelectorAll('section'));
				assert.equal(inputs.length, 128);
				assert.equal(sections.length, 128);
				for (let i = 0; i < inputs.length; i++) inputs[i].value = `draft-${i}`;
				phases[mode + '-mount'] = { ...count(), html: container.innerHTML };
				reset();
				for (tick = 1; tick <= 8; tick++) render();
				assert.deepEqual(Array.from(container.querySelectorAll('input')), inputs);
				assert.deepEqual(Array.from(container.querySelectorAll('section')), sections);
				assert.deepEqual(
					inputs.map((n) => n.value),
					inputs.map((_, i) => `draft-${i}`),
				);
				if (mode === 'Ordinary') assert.equal(sections[0].title, '8');
				if (mode === 'Scoped') {
					assert.equal(container.querySelectorAll('span').length, 64);
					assert.equal(container.querySelectorAll('button').length, 64);
					runtime.flushSync(() => container.querySelector('button').click());
					assert.equal(container.querySelector('button').textContent, '1');
				}
				phases[mode + '-updates'] = { ...count(), html: container.innerHTML };
				if (mode === 'Scoped') {
					reset();
					runtime.flushSync(() =>
						root.render(runtime.Scoped, { first: true, second: false, tick: 9 }),
					);
					const matches = sections.every((s, i) =>
						i % 2 === 0
							? s.querySelector('button')?.textContent === '0' && s.querySelector('span') === null
							: s.querySelector('span')?.textContent === 'plain' &&
								s.querySelector('button') === null,
					);
					phases.flip = {
						...count(),
						matches,
						identities: inputs.every((n, i) => container.querySelectorAll('input')[i] === n),
						html: container.innerHTML,
					};
				}
				root.unmount();
				assert.equal(container.childNodes.length, 0);
				container.remove();
				assert.equal(count().liveSnapshots, 0);
			}
			records.push(phases);
		} finally {
			await window.happyDOM.close();
		}
	}
	for (const [key, value] of Object.entries(records[0]))
		assert.equal(value.html, records[1][key].html, 'observer ' + key);
	const hash = (s) => createHash('sha256').update(s).digest('hex');
	const phases = Object.fromEntries(
		Object.entries(records[1]).map(([k, { html, ...rest }]) => [
			k,
			{ ...rest, semanticSha256: hash(html) },
		]),
	);
	if (process.argv[2] === undefined)
		assert.equal(
			phases.flip.matches,
			true,
			'current runtime must reconcile the changed Provider shape',
		);
	const report = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		runtimeFile,
		sourceSha256: hash(source),
		fixtureSha256: hash(fixture),
		runnerSha256: hash(fs.readFileSync(import.meta.filename)),
		entrySha256: hash(entry),
		size,
		snapshotSites,
		measurement:
			'Actual source sites and currently stamped records/child arrays; no heap, GC, or throughput claim',
		phases,
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	fs.rmSync(scratch, { recursive: true, force: true });
}
