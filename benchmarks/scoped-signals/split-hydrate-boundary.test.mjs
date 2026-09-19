import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { compile } from '../../packages/octane/src/compiler/compile.js';
import { Window } from 'happy-dom';
import { MessageChannel } from 'node:worker_threads';

const filename = path.resolve('benchmarks/scoped-signals/split-hydrate-consumer.tsrx');

async function bundle(source) {
	const result = await build({
		stdin: {
			contents: compile(source, filename, { dev: false, hmr: false }).code,
			resolveDir: path.dirname(filename),
			loader: 'js',
		},
		plugins: [
			{
				name: 'authored-hydrate-query',
				setup(build) {
					build.onResolve({ filter: /\?octane-hydrate=/ }, (args) => ({
						path: path.resolve(args.resolveDir, args.path),
						namespace: 'authored-hydrate-query',
					}));
					build.onLoad({ filter: /.*/, namespace: 'authored-hydrate-query' }, (args) => ({
						contents: compile(source, args.path, { dev: false, hmr: false }).code,
						loader: 'js',
						resolveDir: path.dirname(filename),
					}));
				},
			},
		],
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
	return result.outputFiles[0].text;
}

test('code-split template consumers omit unused general child rendering', async (t) => {
	const source = await readFile(filename, 'utf8');
	const sizes = [];
	for (const explicit of [false, true]) {
		const control = explicit
			? source.replace('when={load()}', 'when={load()} fallback={undefined}')
			: source;
		const code = await bundle(control);
		const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
		const channels = [];
		class ConsumerMessageChannel extends MessageChannel {
			constructor() {
				super();
				channels.push(this);
			}
		}
		window.MessageChannel = ConsumerMessageChannel;
		try {
			window.eval(code);
			const host = window.document.createElement('div');
			window.document.body.append(host);
			assert.deepEqual(JSON.parse(JSON.stringify(await window.__OCTANE_REACHABILITY__.run(host))), {
				initial: 'first:0',
				updated: 'first:1',
				identity: true,
				effects: ['mount', 'cleanup'],
				cleaned: true,
			});
		} finally {
			for (const channel of channels) {
				channel.port1.close();
				channel.port2.close();
			}
			window.close();
		}
		sizes.push(gzipSync(code, { level: 9 }).length);
	}
	assert.ok(sizes[0] < sizes[1] * 0.8, `split template ${sizes[0]} vs general ${sizes[1]} gzip`);
	t.diagnostic(
		`Complete split consumer ${sizes[0]}, explicit generic fallback ${sizes[1]} gzip; both public snapshots pass`,
	);
});

test('split admission comes from extraction and declines authored overrides and execution modes', (t) => {
	const prefix = "import {Hydrate as H}from'octane';";
	const body =
		'export function App(props) @{<H when={props.when}><p>{props.label as string}</p></H>}';
	let checked = 0;
	const check = (source, selected, options = {}) => {
		const { code } = compile(source, filename, { dev: false, hmr: false, ...options });
		assert.equal(code.includes('__HydrateCompiled as'), selected, source + JSON.stringify(options));
		checked++;
	};
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
	])
		check(prefix + body.replace('when={props.when}', 'when={props.when} ' + attr), false);
	assert.throws(
		() =>
			compile(
				prefix + body.replace('<p>{props.label as string}</p>', '{() => <p>render prop</p>}'),
				filename,
				{ dev: false, hmr: false },
			),
		/function children cannot be split/,
	);
	check(prefix + body.replace('App(props)', 'App(props,H)'), false);
	check(prefix + body.replace('<H ', '<props.H ').replace('</H>', '</props.H>'), false);
	for (const options of [{ dev: true }, { hmr: true }, { profile: true }, { mode: 'server' }])
		check(prefix + body, false, options);
	t.diagnostic(`${checked} extraction, ownership, configuration and deployment controls`);
});

test('split templates retain opaque handles after a late model-engine import', async (t) => {
	const source = `import {createRoot,act,flushSync,Hydrate} from 'octane';import {load} from 'octane/hydration';
 function App(props) @{ <Hydrate when={load()}><section><span title={props.value}>{props.value as string}</span><input value={props.value}/></section></Hydrate> }
 export async function run(host) {
 const root=createRoot(host);root.render(App,{value:'plain'});await act(()=>{});
 const span=host.querySelector('span'),input=host.querySelector('input');
 const plain=span.textContent==='plain'&&input.value==='plain';
 const {createScope}=await import('octane/signals');const scope=createScope({scopeKey:'late-split-template'}),value=scope.signal$('value','first');
 await act(()=>root.render(App,{value}));
 const first=span.textContent==='first'&&input.value==='first';
 flushSync(()=>value.set('second'));const snapshot={plain,first,text:span.textContent,title:span.title,value:input.value,identity:span===host.querySelector('span')&&input===host.querySelector('input')};
 root.unmount();flushSync(()=>value.set('retired'));scope.dispose();return {...snapshot,cleaned:host.childNodes.length===0};
 }`;
	const code = await bundle(source);
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } }),
		channels = [];
	class ConsumerMessageChannel extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	}
	window.MessageChannel = ConsumerMessageChannel;
	try {
		window.eval(code);
		const host = window.document.createElement('div');
		window.document.body.append(host);
		assert.deepEqual(JSON.parse(JSON.stringify(await window.__OCTANE_REACHABILITY__.run(host))), {
			plain: true,
			first: true,
			text: 'second',
			title: 'second',
			value: 'second',
			identity: true,
			cleaned: true,
		});
	} finally {
		for (const channel of channels) {
			channel.port1.close();
			channel.port2.close();
		}
		window.close();
	}
	t.diagnostic(
		'Actual late text, attribute and controlled-value handles update the same native nodes',
	);
});
