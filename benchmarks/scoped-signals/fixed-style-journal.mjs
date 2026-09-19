import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';

const root = path.resolve(import.meta.dirname, '../..');
const source = path.join(root, 'packages/octane/src');
const hash = (value) => createHash('sha256').update(value).digest('hex');

export async function buildFixedStyleJournal({ dev = false, runtimePath } = {}) {
	const authored = `import {createRoot,flushSync,useState} from 'octane';
function Fixed({bind,items}) @{
 const [n,setN]=useState(0);bind(setN);
 <main>@for(const id of items; key id){
 <div data-style="target" style={{color:n?'blue':'red',backgroundColor:n?'white':'black',width:n?20:10,height:n?40:30,opacity:n?0.8:0.5,'--test':n?'after':'before'}}><input/></div>
 }</main>
}
function Opaque({bind,items}) @{
 const [n,setN]=useState(0);bind(setN);
 const style={color:n?'blue':'red',backgroundColor:n?'white':'black',width:n?20:10,height:n?40:30,opacity:n?0.8:0.5,'--test':n?'after':'before'};
 <main>@for(const id of items; key id){<div data-style="target" style={style}><input/></div>}</main>
}
export function mount(parent,opaque,items){let setter;const root=createRoot(parent);root.render(opaque?Opaque:Fixed,{items,bind(value){setter=value;}});return{update(n){flushSync(()=>setter(n));},dispose(){root.unmount();}};}
`;
	const flags = ['OCTANE_COMPILE_FROZEN_AST', 'OCTANE_COMPILE_ASSERT_LOC'];
	const previousFlags = flags.map((flag) => [flag, process.env[flag]]);
	let compiled;
	try {
		for (const flag of flags) process.env[flag] = '1';
		compiled = compile(authored, path.join(root, 'FixedStyleJournal.tsrx'), {
			mode: 'client',
			dev,
			hmr: false,
		});
	} finally {
		for (const [flag, previous] of previousFlags) {
			if (previous === undefined) delete process.env[flag];
			else process.env[flag] = previous;
		}
	}
	const runtime = await readFile(runtimePath ?? path.join(source, 'runtime.ts'), 'utf8');
	const result = await build({
		stdin: { contents: compiled.code, resolveDir: source },
		bundle: true,
		write: false,
		minify: true,
		metafile: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		legalComments: 'none',
		tsconfigRaw: { compilerOptions: {} },
		alias: {
			'octane/internal/client': path.join(source, 'internal/client.ts'),
			octane: path.join(source, 'index.ts'),
		},
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: runtimePath
			? [
					{
						name: 'selected-runtime',
						setup(plugin) {
							plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: file }) => {
								assert.equal(file, path.join(source, 'runtime.ts'));
								return { contents: runtime, loader: 'ts', resolveDir: source };
							});
						},
					},
				]
			: [],
	});
	assert.ok(
		Object.keys(result.metafile.inputs).some(
			(file) => path.resolve(file) === path.join(source, 'runtime.ts'),
		),
	);
	const code = result.outputFiles[0].text;
	return {
		code,
		dev,
		raw: Buffer.byteLength(code),
		gzip: gzipSync(code).length,
		hashes: {
			authored: hash(authored),
			compiled: hash(compiled.code),
			runtime: hash(runtime),
			bundle: hash(code),
		},
	};
}

export async function measureFixedStyleJournal({ rows = 100, ...options } = {}) {
	const built = await buildFixedStyleJournal(options);
	const window = new Window();
	const globals = new Map();
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'Comment',
		'Text',
		'Event',
	]) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	const originalGet = window.Element.prototype.getAttribute;
	const scenarios = [];
	let mounted;
	try {
		const api = await import(
			'data:text/javascript;base64,' + Buffer.from(built.code).toString('base64')
		);
		for (const opaque of [false, true]) {
			const host = window.document.createElement('section');
			window.document.body.append(host);
			mounted = api.mount(
				host,
				opaque,
				Array.from({ length: rows }, (_, index) => index),
			);
			const targets = Array.from(host.querySelectorAll('[data-style="target"]'));
			assert.equal(targets.length, rows);
			const inputs = targets.map((target) => target.querySelector('input'));
			for (const input of inputs) input.value = 'retained draft';
			const targetSet = new Set(targets);
			let styleReads = 0;
			window.Element.prototype.getAttribute = function (name) {
				if (name === 'style' && targetSet.has(this)) styleReads++;
				return Reflect.apply(originalGet, this, [name]);
			};
			try {
				mounted.update(1);
			} finally {
				window.Element.prototype.getAttribute = originalGet;
			}
			assert.deepEqual(Array.from(host.querySelectorAll('[data-style="target"]')), targets);
			for (const [index, target] of targets.entries()) {
				assert.equal(target.querySelector('input'), inputs[index]);
				assert.equal(inputs[index].value, 'retained draft');
				assert.equal(target.style.color, 'blue');
				assert.equal(target.style.backgroundColor, 'white');
				assert.equal(target.style.width, '20px');
				assert.equal(target.style.height, '40px');
				assert.equal(target.style.opacity, '0.8');
				assert.equal(target.style.getPropertyValue('--test'), 'after');
			}
			scenarios.push({ opaque, styleReads, finalCSS: targets[0].style.cssText });
			mounted.dispose();
			mounted = undefined;
			assert.equal(host.childNodes.length, 0);
			host.remove();
		}
		assert.equal(scenarios[0].finalCSS, scenarios[1].finalCSS);
		const { code: _code, ...metadata } = built;
		return { ...metadata, rows, scenarios };
	} finally {
		window.Element.prototype.getAttribute = originalGet;
		mounted?.dispose();
		window.close();
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
	console.log(
		JSON.stringify(await measureFixedStyleJournal({ runtimePath: process.argv[2] }), null, 2),
	);
}
