import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const root = path.resolve(import.meta.dirname, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');

/** Separate source-work observation; instrumented output never contributes bytes. */
export async function measurePrimitiveLocalSSR({
	sourceRoot = root,
	dev = false,
	rows = 100,
	primitive = true,
} = {}) {
	const source = path.join(sourceRoot, 'packages/octane/src');
	const { compile } = await import(pathToFileURL(path.join(source, 'compiler/compile.js')).href);
	const authored = `import {renderToString} from 'octane/server';
function Row(props) @{
 const value=${primitive ? 'String(props.read(props.item.id))' : 'props.read(props.item.id)'};
 <section><output title={value}>{value as string}</output><input value={value}/></section>
}
function View(props) @{
 <main>@for(const item of props.items;key item.id){<Row item={item} read={props.read}/>}</main>
}
export function render(items,read,options){return renderToString(View,{items,read},options);}`;
	const compiled = compile(authored, '/benchmark/PrimitiveLocalSSR.tsrx', {
		mode: 'server',
		dev,
		hmr: false,
	});
	const runtime = await readFile(path.join(source, 'runtime.server.ts'), 'utf8');
	let observedRuntime = runtime;
	for (const [declaration, kind] of [
		['export function ssrSignalValue(value: unknown): unknown {', 'value'],
		['export function ssrSignalControlValue(value: unknown, site: string): unknown {', 'control'],
	]) {
		assert.equal(observedRuntime.split(declaration).length, 2);
		observedRuntime = observedRuntime.replace(
			declaration,
			declaration + `\n globalThis.__primitiveLocalWork.${kind}++;`,
		);
	}
	const bundle = async (observed) => {
		const result = await build({
			absWorkingDir: sourceRoot,
			stdin: {
				contents: compiled.code + '\nexport {createScope} from "octane/signals";',
				resolveDir: sourceRoot,
			},
			bundle: true,
			write: false,
			minify: true,
			metafile: true,
			format: 'esm',
			platform: 'node',
			target: 'es2022',
			legalComments: 'none',
			tsconfigRaw: { compilerOptions: {} },
			alias: {
				'octane/internal/server': path.join(source, 'internal/server.ts'),
				'octane/server': path.join(source, 'server/index.ts'),
				'octane/signals': path.join(source, 'signals/index.ts'),
			},
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			plugins: observed
				? [
						{
							name: 'primitive-local-work',
							setup(plugin) {
								plugin.onLoad({ filter: /\/runtime\.server\.ts$/ }, ({ path: file }) => {
									assert.equal(file, path.join(source, 'runtime.server.ts'));
									return { contents: observedRuntime, loader: 'ts', resolveDir: source };
								});
							},
						},
					]
				: [],
		});
		assert.ok(
			Object.keys(result.metafile.inputs).some(
				(file) => path.resolve(sourceRoot, file) === path.join(source, 'runtime.server.ts'),
			),
		);
		return result.outputFiles[0].text;
	};
	const clean = await bundle(false);
	const observed = await bundle(true);
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__primitiveLocalWork');
	const window = new Window();
	try {
		Object.defineProperty(globalThis, '__primitiveLocalWork', {
			configurable: true,
			writable: true,
			value: { value: 0, control: 0 },
		});
		const exercise = async (code) => {
			const api = await import(
				'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
			);
			const scope = api.createScope({ scopeKey: 'primitive-local-ssr' });
			const items = Array.from({ length: rows }, (_, id) => ({ id }));
			const template = window.document.createElement('template');
			let reads = 0;
			const snapshots = [];
			try {
				for (const order of [items, [...items].reverse()]) {
					const result = api.render(order, (id) => {
						reads++;
						return 'row ' + id;
					});
					template.innerHTML = result.html;
					assert.deepEqual(
						[...template.content.querySelectorAll('output')].map((node) => [
							node.textContent,
							node.title,
						]),
						order.map(({ id }) => ['row ' + id, 'row ' + id]),
					);
					assert.deepEqual(
						[...template.content.querySelectorAll('input')].map((node) => node.value),
						order.map(({ id }) => 'row ' + id),
					);
					snapshots.push(result);
				}
				assert.equal(reads, 2 * rows);
				const scalarCalls = { ...globalThis.__primitiveLocalWork };
				if (!primitive) {
					const handles = items.map(({ id }) => scope.signal$('row-' + id, 'row ' + id));
					const result = api.render(items, (id) => handles[id], { signalOwner: scope });
					template.innerHTML = result.html;
					assert.deepEqual(
						[...template.content.querySelectorAll('output')].map((node) => [
							node.textContent,
							node.title,
						]),
						items.map(({ id }) => ['row ' + id, 'row ' + id]),
					);
					assert.deepEqual(
						[...template.content.querySelectorAll('input')].map((node) => node.value),
						items.map(({ id }) => 'row ' + id),
					);
					snapshots.push(result);
				}
				return { snapshots, scalarCalls };
			} finally {
				scope.dispose();
			}
		};
		const cleanResult = await exercise(clean);
		globalThis.__primitiveLocalWork = { value: 0, control: 0 };
		const observedResult = await exercise(observed);
		assert.deepEqual(observedResult.snapshots, cleanResult.snapshots);
		return {
			dev,
			primitive,
			rows,
			scalarCalls: observedResult.scalarCalls,
			fixtureSha256: hash(authored),
			compiledSha256: hash(compiled.code),
			runtimeSha256: hash(runtime),
			clean: {
				raw: Buffer.byteLength(clean),
				gzip: gzipSync(clean).length,
				brotli: brotliCompressSync(clean).length,
				sha256: hash(clean),
			},
			snapshotSha256: hash(JSON.stringify(cleanResult.snapshots)),
		};
	} finally {
		if (descriptor) Object.defineProperty(globalThis, '__primitiveLocalWork', descriptor);
		else delete globalThis.__primitiveLocalWork;
		await window.happyDOM.close();
	}
}

/** Public late-import control for primitive-local codegen work measurements. */
export async function exerciseLateInstanceModels({ sourceRoot = root, dev = false } = {}) {
	const source = path.join(sourceRoot, 'packages/octane/src');
	const { compile } = await import(pathToFileURL(path.join(source, 'compiler/compile.js')).href);
	const authored = `import {createRoot,flushSync} from 'octane';
function Row(props) @{
 const value=String(props.read(props.item.id));
 <button data-row={String(props.item.id)} title={value} onClick={()=>props.invoke(props.item.id)}>{value}</button>
}
function View(props) @{
 <main>@for(const item of props.items;key item.id){<Row item={item} read={props.read} invoke={props.invoke}/>}</main>
}
export function mount(host,items,invoke){
 const root=createRoot(host);
 const props={items,invoke,read:(id)=>'label '+id};
 flushSync(()=>root.render(View,props));
 return {update(items){flushSync(()=>root.render(View,{...props,items}));},dispose(){root.unmount();}};
}`;
	const model = `import {signal$} from 'octane/signals';
export function click$(){
 const count$=signal$(0);
 count$.set(count$.get()+1);
 return count$.get();
}`;
	const flags = ['OCTANE_COMPILE_FROZEN_AST', 'OCTANE_COMPILE_ASSERT_LOC'];
	const savedFlags = new Map(flags.map((flag) => [flag, process.env[flag]]));
	let code;
	let modelCode;
	try {
		for (const flag of flags) process.env[flag] = '1';
		code = compile(authored, '/benchmark/PrimitiveLocalEvents.tsrx', {
			mode: 'client',
			dev,
			hmr: false,
		}).code;
		modelCode = compile(model, '/benchmark/PrimitiveLocalModel.ts', {
			mode: 'client',
			dev,
			hmr: false,
		}).code;
	} finally {
		for (const [flag, value] of savedFlags) {
			if (value === undefined) delete process.env[flag];
			else process.env[flag] = value;
		}
	}
	const dir = await mkdtemp(path.join(tmpdir(), 'octane-primitive-local-events-'));
	const window = new Window();
	const globals = new Map();
	let mounted;
	try {
		const result = await build({
			absWorkingDir: sourceRoot,
			stdin: {
				contents: code + '\nexport function loadModel(){return import("late-instance-model");}',
				resolveDir: sourceRoot,
				sourcefile: 'entry.js',
			},
			bundle: true,
			write: true,
			outdir: dir,
			outExtension: { '.js': '.mjs' },
			splitting: true,
			format: 'esm',
			platform: 'browser',
			target: 'es2022',
			minify: true,
			metafile: true,
			tsconfigRaw: { compilerOptions: {} },
			alias: {
				'octane/internal/client': path.join(source, 'internal/client.ts'),
				'octane/signals': path.join(source, 'signals/index.ts'),
				octane: path.join(source, 'index.ts'),
			},
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			plugins: [
				{
					name: 'late-instance-model',
					setup(plugin) {
						plugin.onResolve({ filter: /^late-instance-model$/ }, () => ({
							path: 'late-instance-model',
							namespace: 'model',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'model' }, () => ({
							contents: modelCode,
							loader: 'js',
							resolveDir: sourceRoot,
						}));
					},
				},
			],
		});
		assert.ok(
			Object.keys(result.metafile.inputs).some(
				(file) => path.resolve(sourceRoot, file) === path.join(source, 'runtime.ts'),
			),
		);
		for (const name of [
			'window',
			'document',
			'Node',
			'Element',
			'HTMLElement',
			'SVGElement',
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
		const entry = Object.keys(result.metafile.outputs).find(
			(file) => result.metafile.outputs[file].entryPoint === 'entry.js',
		);
		assert.ok(entry);
		const api = await import(pathToFileURL(path.resolve(sourceRoot, entry)).href);
		const host = window.document.createElement('div');
		window.document.body.append(host);
		const items = [{ id: 'a' }, { id: 'b' }];
		const observations = [];
		let loaded;
		mounted = api.mount(host, items, (id) => observations.push([id, loaded.click$()]));
		const first = host.querySelector('[data-row="a"]');
		const second = host.querySelector('[data-row="b"]');
		assert.equal(first.textContent, 'label a');
		assert.equal(first.title, 'label a');
		// The model module and its capability registration genuinely arrive after mount.
		loaded = await api.loadModel();
		first.click();
		second.click();
		first.click();
		mounted.update([...items].reverse());
		assert.equal(host.querySelector('[data-row="a"]'), first);
		assert.equal(host.querySelector('[data-row="b"]'), second);
		first.click();
		second.click();
		mounted.update([items[1]]);
		mounted.update(items);
		const replacement = host.querySelector('[data-row="a"]');
		assert.notEqual(replacement, first);
		replacement.click();
		second.click();
		assert.deepEqual(observations, [
			['a', 1],
			['b', 1],
			['a', 2],
			['a', 3],
			['b', 2],
			['a', 1],
			['b', 3],
		]);
		return { observations, html: host.innerHTML, source: authored };
	} finally {
		mounted?.dispose();
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		await window.happyDOM.close();
		await rm(dir, { recursive: true, force: true });
	}
}
