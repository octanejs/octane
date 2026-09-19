// Source-site work counters around the real production form paths. The clean
// bundle performs the same semantic checks without the observer instrumentation.
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
import { compile } from '../../packages/octane/src/compiler/compile.js';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const runtimePath = path.join(repo, 'packages/octane/src/runtime.ts');
const runtimeFile = path.resolve(process.argv[2] ?? runtimePath);
const runtimeSource = fs.readFileSync(runtimeFile, 'utf8');
const ast = ts.createSourceFile(runtimePath, runtimeSource, ts.ScriptTarget.Latest, true);
const edits = [];
let observedFunctions = 0;
const hasApplicationHelper = ast.statements.some(
	(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'applyFormControlValues',
);
for (const fn of ast.statements) {
	if (!ts.isFunctionDeclaration(fn) || !fn.body) continue;
	const name = fn.name?.text;
	if (
		![
			'setFormControlSources',
			'projectSelectValue',
			'applyFormControlValues',
			'setHostPropSources',
		].includes(name)
	)
		continue;
	observedFunctions++;
	let closures = 0;
	function scan(node) {
		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) closures++;
		if (
			name === 'setHostPropSources' &&
			ts.isCallExpression(node) &&
			node.expression.getText(ast) === 'props.get' &&
			ts.isStringLiteral(node.arguments[0]) &&
			['value', 'defaultValue', 'checked', 'defaultChecked', 'multiple'].includes(
				node.arguments[0].text,
			)
		) {
			edits.push(
				[node.getStart(ast), '(globalThis.__formWork.writer_lookups++, '],
				[node.end, ')'],
			);
		}
		if (
			name === 'setFormControlSources' &&
			ts.isCallExpression(node) &&
			node.expression.getText(ast) === 'Object.prototype.propertyIsEnumerable.call'
		) {
			edits.push(
				[node.getStart(ast), '(globalThis.__formWork.enumerable_checks++, '],
				[node.end, ')'],
			);
		}
		if (
			name === 'projectSelectValue' &&
			ts.isElementAccessExpression(node) &&
			node.expression.getText(ast) === 'options'
		) {
			edits.push([node.getStart(ast), '(globalThis.__formWork.option_reads++, '], [node.end, ')']);
		}
		ts.forEachChild(node, scan);
	}
	scan(fn.body);
	const statements =
		name === 'setFormControlSources'
			? `globalThis.__formWork.resolver_calls++; globalThis.__formWork.closure_sites += ${closures};${hasApplicationHelper ? '' : 'globalThis.__formWork.applications++;'}`
			: name === 'projectSelectValue'
				? 'globalThis.__formWork.projections++;'
				: name === 'applyFormControlValues'
					? 'globalThis.__formWork.applications++;'
					: '';
	edits.push([fn.body.getStart(ast) + 1, statements]);
}
assert.ok(observedFunctions === 3 || observedFunctions === 4);
let observedRuntime = runtimeSource;
for (const [offset, text] of edits.sort((a, b) => b[0] - a[0]))
	observedRuntime = observedRuntime.slice(0, offset) + text + observedRuntime.slice(offset);
const source = `
export function SpreadForms(props) @{
 <section>
  @for (const row of props.rows; key row) {
   <div>
    <input data-control="text" {...props.input} readOnly />
    <textarea data-control="textarea" {...props.textarea} readOnly />
    <input data-control="checked" type="checkbox" {...props.checkbox} readOnly />
    <select data-control="select" {...props.select} onInput={() => {}}>
     @for (const option of props.options; key option) {
      <option value={option}>{option}</option>
     }
    </select>
   </div>
  }
 </section>
}
export function DirectForms(props) @{
 <section>
  @for (const row of props.rows; key row) {
   <div>
    <input data-control="text" value={props.input.value} readOnly />
    <textarea data-control="textarea" value={props.textarea.value} readOnly />
    <input data-control="checked" type="checkbox" checked={props.checkbox.checked} readOnly />
    <select data-control="select" multiple value={props.select.value} onInput={() => {}}>
     @for (const option of props.options; key option) {
      <option value={option}>{option}</option>
     }
    </select>
   </div>
  }
 </section>
}
`;
const compiled = compile(source, 'descriptor-form-work.tsrx', { dev: false, hmr: false }).code;
const adapter = `
import {bag4, clone, template, setFormControlSources} from 'octane';
const controlTemplate = template('<section><input data-control="text"><textarea data-control="textarea"></textarea><input data-control="checked" type="checkbox"><select data-control="select"><option value="a">a</option><option value="b">b</option><option value="c">c</option><option value="d">d</option><option value="e">e</option><option value="f">f</option><option value="g">g</option><option value="h">h</option></select></section>');
export function CompatibilityForms(props, scope) {
 let b = scope.slots[0];
 if (b === undefined) { const root = clone(controlTemplate); b = bag4(scope,root,root.children[0],root.children[1],root.children[2],root.children[3]); }
 setFormControlSources(b.a, [[false,'value','overridden'],[true,props.input]]);
 setFormControlSources(b.b, [[false,'value','overridden'],[true,props.textarea]]);
 setFormControlSources(b.c, [[false,'checked',false],[true,props.checkbox]]);
 setFormControlSources(b.d, [[false,'value','overridden'],[true,props.select]]);
}
export {createRoot, flushSync} from 'octane';`;
const emptyWork = () => ({
	writer_lookups: 0,
	resolver_calls: 0,
	closure_sites: 0,
	enumerable_checks: 0,
	option_reads: 0,
	projections: 0,
	applications: 0,
});
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-descriptor-forms-'));
const window = new Window();
for (const name of [
	'window',
	'document',
	'Node',
	'Element',
	'HTMLElement',
	'SVGElement',
	'Text',
	'Comment',
	'Event',
	'MouseEvent',
	'MutationObserver',
])
	globalThis[name] = name === 'window' ? window : window[name];
let size;
const results = [];
try {
	for (const observed of [false, true]) {
		const outfile = path.join(scratch, `${observed}.mjs`);
		const built = await build({
			stdin: { contents: compiled + '\n' + adapter, resolveDir: repo, loader: 'js' },
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
						plugin.onResolve(
							{ filter: /^octane(?:\/internal\/client)?$/ },
							({ path: request }) => ({
								path: path.join(
									repo,
									'packages/octane/src',
									request === 'octane' ? 'index.ts' : 'internal/client.ts',
								),
							}),
						);
						plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: loaded }) =>
							loaded === runtimePath
								? {
										contents: observed ? observedRuntime : runtimeSource,
										loader: 'ts',
										resolveDir: path.dirname(runtimePath),
									}
								: null,
						);
					},
				},
			],
		});
		fs.writeFileSync(outfile, built.outputFiles[0].text);
		if (!observed)
			size = {
				minified: built.outputFiles[0].contents.length,
				gzip: gzipSync(built.outputFiles[0].contents).length,
			};
		const { SpreadForms, DirectForms, CompatibilityForms, createRoot, flushSync } = await import(
			pathToFileURL(outfile)
		);
		const records = {};
		for (const [mode, App, count] of [
			['spread', SpreadForms, 128],
			['direct', DirectForms, 128],
			['compatibility', CompatibilityForms, 1],
		]) {
			const props = {
				rows: Array.from({ length: count }, (_, i) => i),
				input: { value: 'before' },
				textarea: { value: 'before' },
				checkbox: { checked: false },
				select: { value: ['a', 'c'], multiple: true },
				options: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
			};
			const container = document.createElement('main');
			document.body.append(container);
			const root = createRoot(container);
			globalThis.__formWork = emptyWork();
			root.render(App, props);
			flushSync(() => {});
			const original = Array.from(container.querySelectorAll('input,textarea,select'));
			assert.equal(original.length, count * 4);
			for (const phase of ['changed', 'unchanged']) {
				const next = {
					...props,
					input: { value: 'after' },
					textarea: { value: 'after' },
					checkbox: { checked: true },
					select: { value: ['b', 'h'], multiple: true },
				};
				globalThis.__formWork = emptyWork();
				flushSync(() => root.render(App, next));
				const work = { ...globalThis.__formWork };
				const current = Array.from(container.querySelectorAll('input,textarea,select'));
				for (let i = 0; i < current.length; i++) assert.equal(current[i], original[i]);
				assert.deepEqual(
					Array.from(
						container.querySelectorAll('[data-control="text"],[data-control="textarea"]'),
						(el) => el.value,
					),
					Array(count * 2).fill('after'),
				);
				assert.ok(
					Array.from(container.querySelectorAll('[data-control="checked"]')).every(
						(el) => el.checked,
					),
				);
				for (const select of container.querySelectorAll('select'))
					assert.deepEqual(
						Array.from(select.options)
							.filter((o) => o.selected)
							.map((o) => o.value),
						['b', 'h'],
					);
				const text = container.querySelector('input');
				text.value = 'rejected';
				text.dispatchEvent(new Event('input', { bubbles: true }));
				assert.equal(text.value, 'after');
				records[`${mode}-${phase}`] = { work, semantic: container.innerHTML };
			}
			root.unmount();
			assert.equal(container.childNodes.length, 0);
			container.remove();
		}
		results.push(records);
	}
	for (const mode of Object.keys(results[0]))
		assert.equal(results[0][mode].semantic, results[1][mode].semantic);
	const measure = (median) => ({ median, min: median, samples: 1 });
	const metadata = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		runtimeFile,
		runtimeSha256: createHash('sha256').update(runtimeSource).digest('hex'),
		sourceSha256: createHash('sha256')
			.update(source + adapter)
			.digest('hex'),
		size,
		measurement: 'reached source sites; no timing or heap claim',
	};
	const targets = Object.entries(results[1]).flatMap(([mode, { work, semantic }]) => [
		{
			name: `forms-${mode}`,
			ops: Object.fromEntries(Object.entries(work).map(([name, count]) => [name, measure(count)])),
			meta: {
				...metadata,
				gate: 'passed',
				semanticSha256: createHash('sha256').update(semantic).digest('hex'),
			},
		},
		{
			name: `forms-${mode}-work`,
			ops: Object.fromEntries(
				Object.entries(work).map(([name]) => [
					name,
					measure(mode.startsWith('compatibility') ? 1 : 128),
				]),
			),
			meta: { ...metadata, gate: 'passed' },
		},
	]);
	const report = {
		suite: 'descriptor-renderer',
		node: process.version,
		runtimeFile,
		runtimeSha256: createHash('sha256').update(runtimeSource).digest('hex'),
		sourceSha256: createHash('sha256')
			.update(source + adapter)
			.digest('hex'),
		size,
		targets,
		limitations: [
			'Reached closure and DOM-access source sites measure work, not heap allocations or browser throughput.',
			'Both projection passes and the complete rollback prepass are retained.',
			'Clean and observed production bundles pass identical DOM, identity, native-input restoration and teardown controls.',
		],
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report, null, 2));
} finally {
	await window.happyDOM.close();
	fs.rmSync(scratch, { recursive: true, force: true });
}
