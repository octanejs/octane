import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { verifyScenario } from '../bundle-size/verify-reachability.mjs';

test('deferred template consumers exclude optional returned-output rendering', async (t) => {
	const filename = path.resolve('benchmarks/bundle-size/fixtures/minimal/deferred-hydration.tsrx');
	const authored = await readFile(filename, 'utf8');
	const sizes = [];
	for (const explicit of [false, true]) {
		// An explicit undefined fallback keeps the public generic ABI while doing
		// the same visible work as the absent fallback in this fixed consumer.
		const source = explicit
			? authored.replace('split={false}', 'split={false} fallback={undefined}')
			: authored;
		assert.notEqual(source, explicit ? authored : '');
		const compiled = compile(source, filename, { mode: 'client', dev: false, hmr: false }).code;
		const result = await build({
			stdin: { contents: compiled, resolveDir: path.resolve('packages/octane'), loader: 'js' },
			bundle: true,
			write: false,
			minify: true,
			format: 'iife',
			globalName: '__OCTANE_REACHABILITY__',
			platform: 'browser',
			target: 'esnext',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		});
		const code = result.outputFiles[0].text;
		await verifyScenario('deferred-hydration', code);
		sizes.push(gzipSync(code, { level: 9 }).length);
	}
	assert.ok(
		sizes[0] < sizes[1] * 0.8,
		`deferred templates ${sizes[0]} vs generic ${sizes[1]} gzip`,
	);
	t.diagnostic(
		`Deferred template ${sizes[0]}, explicit generic fallback ${sizes[1]} gzip; both semantic controls pass`,
	);
});

test('deferred template proof declines caller-controlled configuration and execution modes', (t) => {
	const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
	process.env.OCTANE_COMPILE_FROZEN_AST = '1';
	const prefix = "import {Hydrate as H} from 'octane';";
	const body =
		'export function App(props) @{ <H when={props.when} split={false}><p>child</p></H> }';
	let checked = 0;
	const check = (source, selected, options = {}) => {
		const { code } = compile(source, 'deferred-proof.tsrx', {
			mode: 'client',
			dev: false,
			hmr: false,
			...options,
		});
		assert.equal(code.includes('__HydrateCompiled as'), selected, source + JSON.stringify(options));
		checked++;
	};
	try {
		check(prefix + body, true);
		for (const attr of [
			'fallback={undefined}',
			'fallback={null}',
			'fallback={props.fallback}',
			'children={props.children}',
			'__load={props.load}',
			'__data={props.data}',
			'__independent={props.independent}',
			'__proto__={props.proto}',
			'data:note="name"',
			'{...props.boundary}',
		]) {
			check(prefix + body.replace('split={false}', 'split={false} ' + attr), false);
		}
		check(prefix + body.replace('<p>child</p>', '{() => <p>render prop</p>}'), false);
		check(prefix + body.replace('App(props)', 'App(props, H)'), false);
		check(prefix + body.replace('<H ', '<props.H ').replace('</H>', '</props.H>'), false);
		check(
			"import * as Octane from 'octane';" +
				body.replaceAll('H ', 'Octane.Hydrate ').replace('</H>', '</Octane.Hydrate>'),
			false,
		);
		check(prefix + body.replace('split={false}', ''), false);
		for (const options of [{ dev: true }, { hmr: true }, { profile: true }, { mode: 'server' }])
			check(prefix + body, false, options);
		t.diagnostic(`${checked} production ownership/configuration and mode controls`);
	} finally {
		if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
		else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
	}
});

test('deferred templates accept actual handles after a late model-engine import', async (t) => {
	const source = `import {createRoot,flushSync,Hydrate} from 'octane';
import {load} from 'octane/hydration';
function App(props) @{ <Hydrate when={load()} split={false}><section><span title={props.value}>{props.value as string}</span><input value={props.value}/></section></Hydrate> }
export async function run(host) {
 const root=createRoot(host); root.render(App,{value:'plain'});
 const span=host.querySelector('span'),input=host.querySelector('input');
 if(span.textContent!=='plain'||input.value!=='plain')throw Error('ordinary values');
 const {createScope}=await import('octane/signals');
 const scope=createScope({scopeKey:'late-deferred-template'}),value=scope.signal$('value','first');
 flushSync(()=>root.render(App,{value}));
 if(span.textContent!=='first'||input.value!=='first')throw Error('late handle');
 flushSync(()=>value.set('second'));
 const snapshot={text:span.textContent,title:span.title,value:input.value,identity:span===host.querySelector('span')&&input===host.querySelector('input')};
 root.unmount();flushSync(()=>value.set('retired'));scope.dispose();
 return {...snapshot,cleaned:host.childNodes.length===0};
}`;
	const contents = compile(source, 'late-deferred-template.tsrx', { dev: false, hmr: false }).code;
	const result = await build({
		stdin: { contents, resolveDir: path.resolve('packages/octane') },
		bundle: true,
		write: false,
		minify: true,
		format: 'iife',
		globalName: '__DEFERRED_HANDLES__',
		target: 'esnext',
		platform: 'browser',
		tsconfigRaw: { compilerOptions: {} },
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	});
	// Execute in the DOM's own realm. Running the browser bundle in Node's realm
	// exposes Node's persistent MessageChannel to the passive-effect scheduler.
	const { window } = new JSDOM('<body></body>', {
		runScripts: 'dangerously',
		pretendToBeVisual: true,
	});
	t.after(() => window.close());
	window.eval(result.outputFiles[0].text);
	const api = window.__DEFERRED_HANDLES__;
	const host = window.document.createElement('div');
	window.document.body.append(host);
	assert.deepEqual(JSON.parse(JSON.stringify(await api.run(host))), {
		text: 'second',
		title: 'second',
		value: 'second',
		identity: true,
		cleaned: true,
	});
});
