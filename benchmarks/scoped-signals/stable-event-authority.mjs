import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';

const root = path.resolve(import.meta.dirname, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');

export async function measureStableEventAuthority({
	runtimePath,
	dev = false,
	rows = 100,
	updates = 4,
} = {}) {
	const source = path.join(root, 'packages/octane/src');
	const authored = `import {createRoot,flushSync} from 'octane';
function Row({item,invoke,other}) @{
 const id=item.id;
 <article data-row={item.id}><span title={item.label}>{item.label as string}</span><input />
 <button data-kind="zero" onClick={() => invoke()}>zero</button>
 <button data-kind="one" onClick={() => invoke(id)}>one</button>
 <button data-kind="two" onClick={() => invoke(id,other)}>two</button>
 <button data-kind="event" onClick={(event) => { invoke(event.type,id); }}>event</button></article>
}
function List(props) @{
 <main>@for (const item of props.items; key item.id) { <Row item={item} invoke={props.invoke} other={props.other}/> }</main>
}
export function mount(parent,props) {
 const root=createRoot(parent);root.render(List,props);
 return {update(props){flushSync(()=>root.render(List,props));},dispose(){root.unmount();}};
}`;
	const flags = ['OCTANE_COMPILE_FROZEN_AST', 'OCTANE_COMPILE_ASSERT_LOC'];
	const previousFlags = flags.map((flag) => [flag, process.env[flag]]);
	let compiled;
	try {
		for (const flag of flags) process.env[flag] = '1';
		compiled = compile(
			authored,
			path.join(root, 'benchmarks/scoped-signals/StableEventAuthority.tsrx'),
			{
				mode: 'client',
				dev,
				hmr: false,
			},
		);
	} finally {
		for (const [flag, previous] of previousFlags) {
			if (previous === undefined) delete process.env[flag];
			else process.env[flag] = previous;
		}
	}
	const runtime = await readFile(runtimePath ?? path.join(source, 'runtime.ts'), 'utf8');
	const result = await build({
		stdin: { contents: compiled.code, resolveDir: path.dirname(source) },
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
	const host = window.document.createElement('div');
	window.document.body.append(host);
	let mounted;
	const seen = [];
	const invoke = (...values) => seen.push(values);
	const items = Array.from({ length: rows }, (_, index) => ({
		id: String(index),
		label: 'Row ' + index,
	}));
	const originalSet = WeakMap.prototype.set;
	let records = 0;
	const count = (callback) => {
		records = 0;
		// Observe actual element-to-invocation authority writes. This is work
		// evidence; latest handlers, drafts and DOM identity are checked separately.
		WeakMap.prototype.set = function (key, value) {
			if (
				key instanceof window.Element &&
				value !== null &&
				typeof value === 'object' &&
				Array.isArray(value.slots) &&
				value.block !== undefined
			)
				records++;
			return Reflect.apply(originalSet, this, [key, value]);
		};
		try {
			callback();
			return records;
		} finally {
			WeakMap.prototype.set = originalSet;
		}
	};
	try {
		const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
		const mountWrites = count(() => {
			mounted = api.mount(host, { items, invoke, other: 'first' });
		});
		assert.equal(host.querySelectorAll('article').length, rows);
		const first = host.querySelector('article[data-row="0"]');
		const input = first.querySelector('input');
		input.value = 'typed before reorder';
		const buttons = Array.from(first.querySelectorAll('button'));
		const retainedWrites = count(() => {
			for (let iteration = 0; iteration < updates; iteration++) {
				const next = items.map((item) => ({
					...item,
					label: 'Update ' + iteration + ' ' + item.id,
				}));
				mounted.update({
					items: iteration % 2 === 0 ? next.toReversed() : next,
					invoke,
					other: 'first',
				});
				assert.equal(host.querySelector('article[data-row="0"]'), first);
				assert.equal(first.querySelector('input'), input);
				assert.equal(input.value, 'typed before reorder');
				assert.equal(first.querySelector('span').title, 'Update ' + iteration + ' 0');
				assert.equal(first.querySelector('span').textContent, 'Update ' + iteration + ' 0');
			}
		});
		for (const button of buttons) button.click();
		assert.deepEqual(seen.splice(0), [[], ['0'], ['0', 'first'], ['click', '0']]);
		const changedCaptureWrites = count(() => mounted.update({ items, invoke, other: 'second' }));
		assert.equal(first.querySelector('button[data-kind="two"]'), buttons[2]);
		buttons[2].click();
		assert.deepEqual(seen.splice(0), [['0', 'second']]);
		mounted.dispose();
		mounted = undefined;
		assert.equal(host.childNodes.length, 0);
		return {
			dev,
			rows,
			updates,
			mountWrites,
			retainedWrites,
			changedCaptureWrites,
			raw: Buffer.byteLength(code),
			gzip: gzipSync(code).length,
			hashes: {
				authored: hash(authored),
				compiled: hash(compiled.code),
				runtime: hash(runtime),
				bundle: hash(code),
			},
		};
	} finally {
		WeakMap.prototype.set = originalSet;
		mounted?.dispose();
		host.remove();
		window.close();
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	}
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
	console.log(
		JSON.stringify(await measureStableEventAuthority({ runtimePath: process.argv[2] }), null, 2),
	);
}
