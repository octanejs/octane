import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { textTypeSourceVersion } from '../../packages/octane/src/compiler/text-type-facts.js';
import { createTextTypeProject } from '../../packages/octane/src/compiler/typescript.js';

function replacementFor(value$, builtin) {
	const replacement = (value) => (value === value$ ? value : builtin(value));
	Object.setPrototypeOf(replacement, builtin);
	return replacement;
}

async function consumer(
	source,
	{
		mode = 'client',
		facts,
		expected,
		extraCode = '',
		filename = 'inline-readonly-values.tsrx',
		dev = false,
	} = {},
) {
	const { code } = compile(source, filename, {
		mode,
		...(facts && { textTypeFacts: facts }),
		dev,
		hmr: false,
	});
	const bundle = await build({
		stdin: {
			contents: code + extraCode,
			resolveDir: path.resolve('packages/octane'),
			loader: 'js',
		},
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: mode === 'server' ? 'node' : 'browser',
		target: 'es2022',
		tsconfigRaw: { compilerOptions: {} },
		define: {
			'process.env.NODE_ENV': dev ? '"development"' : '"production"',
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
	});
	const window = new Window();
	const globals = new Map();
	for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'Comment', 'Text']) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	try {
		const api = await import(
			'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
		);
		const host = window.document.createElement('div');
		window.document.body.append(host);
		assert.deepEqual(
			api.run(host, replacementFor),
			expected ?? {
				initial: ['first', 'first', 'first'],
				updated: ['next', 'next', 'next'],
				identity: true,
				writes: ['a:first', 'b:next'],
				retired: true,
			},
		);
	} finally {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	}
	return gzipSync(bundle.outputFiles[0].contents, { level: 9 }).length;
}

test('readonly computed values keep the scalar consumer closure beside application setters', async (t) => {
	const source = `import {createRoot,flushSync}from'octane';
function View(props) @{props.model.set(props.key,props.labels[props.key]);<section><output title={String(props.labels[props.key])}>{String(props.labels[props.key])}</output><input value={String(props.labels[props.key])}/></section>}
export function run(host){const writes=[];const model={set(key,value){writes.push(key+':'+value)}};const root=createRoot(host);root.render(View,{model,key:'a',labels:{a:'first'}});const output=host.querySelector('output'),input=host.querySelector('input');const initial=[output.textContent,output.title,input.value];root.render(View,{model,key:'b',labels:{b:'next'}});flushSync(()=>{});const updated=[output.textContent,output.title,input.value];const identity=host.querySelector('output')===output&&host.querySelector('input')===input;root.unmount();return{initial,updated,identity,writes,retired:host.childNodes.length===0};}`;
	for (const [label, candidate] of [
		['readonly', source],
		[
			'fresh object',
			source.replace('props.model.set', 'Object.assign({},props.labels);props.model.set'),
		],
		[
			'fresh array',
			source.replace(
				'props.model.set',
				'Reflect.set([],0,props.labels[props.key]);props.model.set',
			),
		],
		[
			'const fresh object',
			source.replace(
				'props.model.set',
				'const target={};Object.assign(target,props.labels);props.model.set',
			),
		],
		[
			'const fresh object alias',
			source.replace(
				'props.model.set',
				'const initial={};const target=initial;Object.assign(target,props.labels);props.model.set',
			),
		],
	]) {
		// A template literal guarantees primitive conversion independently of the
		// builtin constructor. Both lanes perform the same public work.
		const template = candidate.replaceAll(
			'String(props.labels[props.key])',
			'`${props.labels[props.key]}`',
		);
		const readonly = await consumer(candidate);
		const independent = await consumer(template);
		assert.ok(
			readonly < independent * 1.05,
			`${label} builtin ${readonly} vs operator ${independent} gzip`,
		);
		const hole = 'String(props.labels[props.key])';
		const start = candidate.indexOf('>{' + hole + '}') + 2;
		const typed = await consumer(candidate, {
			facts: {
				version: 1,
				filename: 'inline-readonly-values.tsrx',
				sourceVersion: textTypeSourceVersion(candidate),
				projectVersion: 'readonly-native-target',
				stringChildRanges: [[start, start + hole.length]],
			},
		});
		assert.equal(typed, readonly, 'overlapping typed builtin proof preserves the scalar closure');
		t.diagnostic(
			`${label} builtin ${readonly}; independent coercion ${independent} gzip; scalar and typed public controls pass`,
		);
	}
});

test('typed inline and alias results retain real handles after visible constructor mutation', async () => {
	for (const [alias, optional] of [
		[false, false],
		[true, false],
		[false, true],
		[true, true],
	]) {
		for (const mode of ['client', 'server']) {
			const call = `String${optional ? '?.' : ''}(props.value$)`;
			const hole = alias ? 'value' : call;
			const view = `function View(props) @{const env=globalThis;const method=props.method;const mutate=Reflect[method];mutate(env,'String',props.replacement);${alias ? `const value=${call};` : ''}<section><output>{${hole}}</output><b>{props.scalar}</b></section>}`;
			const source = `${mode === 'client' ? "import{createRoot,flushSync}from'octane';" : ''}import{createScope}from'octane/signals';${mode === 'server' ? "import{renderToString}from'octane/server';" : ''}${view}`;
			const extraCode = `
export function run(host,prepare){const scope=createScope({scopeKey:'typed-inline'});const value$=scope.signal$('value','first');const descriptor=Object.getOwnPropertyDescriptor(globalThis,'String');const builtin=String;const replacement=prepare(value$,builtin);let root;try{const props={value$,method:'set',replacement,scalar:'scalar'};${mode === 'server' ? 'return {html:renderToString(View,props,{signalOwner:scope}).html};' : "root=createRoot(host);root.render(View,props);Object.defineProperty(globalThis,'String',descriptor);const output=host.querySelector('output');const initial=host.textContent;flushSync(()=>scope.set(value$,'next'));const updated=host.textContent;const identity=output===host.querySelector('output');root.unmount();flushSync(()=>scope.set(value$,'retired'));return{initial,updated,identity,retired:output.textContent};"}}finally{Object.defineProperty(globalThis,'String',descriptor);root?.unmount();scope.dispose();}}`;
			const holeStart = source.indexOf('>{' + hole + '}') + 2;
			const scalarStart = source.indexOf('>{props.scalar}') + 2;
			const facts = {
				version: 1,
				filename: 'inline-readonly-values.tsrx',
				sourceVersion: textTypeSourceVersion(source),
				projectVersion: 'visible-mutation-contract',
				stringChildRanges: [
					[holeStart, holeStart + hole.length],
					[scalarStart, scalarStart + 'props.scalar'.length],
				],
			};
			if (mode === 'client')
				await consumer(source, {
					facts,
					extraCode,
					expected: {
						initial: 'firstscalar',
						updated: 'nextscalar',
						identity: true,
						retired: 'next',
					},
				});
			else {
				const { code } = compile(source, facts.filename, {
					mode,
					dev: false,
					hmr: false,
					textTypeFacts: facts,
				});
				const bundle = await build({
					stdin: { contents: code + extraCode, resolveDir: path.resolve('packages/octane') },
					bundle: true,
					write: false,
					format: 'esm',
					platform: 'node',
					target: 'es2022',
					tsconfigRaw: { compilerOptions: {} },
					define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
				});
				const api = await import(
					'data:text/javascript;base64,' +
						Buffer.from(bundle.outputFiles[0].text).toString('base64')
				);
				assert.match(api.run(undefined, replacementFor).html, />first<.*>scalar</);
			}
		}
	}
});

test('actual TypeScript constructor-alias and call proofs preserve live values after mutation', async () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-inline-type-project-'));
	fs.symlinkSync(path.resolve('node_modules'), path.join(directory, 'node_modules'), 'dir');
	fs.writeFileSync(
		path.join(directory, 'tsconfig.json'),
		JSON.stringify({
			compilerOptions: {
				strict: true,
				target: 'ESNext',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				jsx: 'react-jsx',
				jsxImportSource: 'octane',
				types: [],
				noEmit: true,
				skipLibCheck: true,
			},
			include: ['*.tsrx'],
		}),
	);
	const variants = [
		['saved constructor', 'const S=String;', 'S(props.value$)'],
		['static call', '', 'String.call(null,props.value$)'],
		['wrapped optional call', '', '(String?.call)?.(null,props.value$)'],
		['static apply', '', 'String.apply(null,[props.value$])'],
		['qualified constructor', '', 'globalThis.String(props.value$)'],
		['computed asserted constructor', '', "globalThis[('String' as 'String')](props.value$)"],
		['computed asserted call', '', "String[('call' as 'call')](null,props.value$)"],
		['computed satisfies apply', '', "String[('apply' satisfies 'apply')](null,[props.value$])"],
		['computed non-null constructor', '', "globalThis[('String'!)](props.value$)"],
	];
	const sources = variants.map(([label, setup, hole], index) => {
		const filename = path.join(directory, `${index}.tsrx`);
		const source = `export function View(props:{value$:unknown,replacement:any,method:'set',scalar:string}) @{const env=globalThis as any;const method=props.method;(Reflect[method] as typeof Reflect.set)(env,'String',props.replacement);${setup}<section><output>{${hole}}</output><b>{props.scalar}</b></section>}`;
		fs.writeFileSync(filename, source);
		return { label, filename, source, hole };
	});
	const project = createTextTypeProject({ tsconfig: path.join(directory, 'tsconfig.json') });
	try {
		for (const { label, filename, source, hole } of sources) {
			const facts = project.snapshot(filename);
			assert.ok(
				facts.stringChildRanges.some(([start, end]) => source.slice(start, end) === hole),
				`${label} needs an actual project-supplied string proof`,
			);
			for (const dev of [true, false]) {
				for (const mode of ['client', 'server']) {
					// The test-side preparation/restoration is added after compilation so
					// it cannot substitute for the authored mutation being guarded.
					const extraCode = `import{createScope}from'octane/signals';${mode === 'client' ? "import{createRoot,flushSync}from'octane';" : "import{renderToString}from'octane/server';"}
export function run(host,prepare){const scope=createScope({scopeKey:'typed-constructor'});const value$=scope.signal$('value','first');const descriptor=Object.getOwnPropertyDescriptor(globalThis,'String');const builtin=String;const replacement=prepare(value$,builtin);let root;try{const props={value$,method:'set',replacement,scalar:'scalar'};${mode === 'server' ? "const html=renderToString(View,props,{signalOwner:scope}).html;return{initial:html.includes('>first<'),scalar:html.includes('>scalar<')};" : "root=createRoot(host);root.render(View,props);Object.defineProperty(globalThis,'String',descriptor);const output=host.querySelector('output');const initial=host.textContent;flushSync(()=>scope.set(value$,'next'));const updated=host.textContent;const identity=output===host.querySelector('output');root.unmount();flushSync(()=>scope.set(value$,'retired'));return{initial,updated,identity,retired:output.textContent,empty:host.childNodes.length===0};"}}finally{Object.defineProperty(globalThis,'String',descriptor);root?.unmount();scope.dispose();}}`;
					await consumer(source, {
						filename,
						facts,
						extraCode,
						dev,
						mode,
						expected:
							mode === 'server'
								? { initial: true, scalar: true }
								: {
										initial: 'firstscalar',
										updated: 'nextscalar',
										identity: true,
										retired: 'next',
										empty: true,
									},
					});
				}
			}
		}
	} finally {
		project.dispose();
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
