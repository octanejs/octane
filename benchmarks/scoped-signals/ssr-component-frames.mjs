import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { Window } from 'happy-dom';

const root = path.resolve(import.meta.dirname, '../..');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const recipeFields = ['signalParentKey', 'signalInvocationSite', 'signalListKeys', 'signalKey'];

/** Matched public SSR output with a separate, untimed source-work observer. */
export async function measureServerComponentFrames({
	sourceRoot = root,
	runtimeSource,
	dev = false,
	potential = true,
	rows = 100,
} = {}) {
	const source = path.join(sourceRoot, 'packages/octane/src');
	const { compile } = await import(pathToFileURL(path.join(source, 'compiler/compile.js')).href);
	const value = potential ? 'value' : 'String(props.item.label)';
	const authored = `import {renderToString,renderToStaticMarkup,useId} from 'octane/server';
function Row(props) @{
 ${potential ? 'const value=props.produce(props.item.label); const id=useId();' : ''}
 <section ${potential ? 'id={id}' : 'id="ordinary"'}><output title={${value}}>{${value} as string}</output><input value={${value}}/></section>
}
function List(props) @{
 <main>@for(const item of props.items; key item.key){<Row item={item} produce={props.produce}/>}</main>
}
function Twins(props) @{
 <aside><List items={props.items} produce={props.produce}/><List items={props.items} produce={props.produce}/></aside>
}
export function render(items,produce,options){return renderToString(List,{items,produce},options);}
export function renderTwins(items,produce){return renderToString(Twins,{items,produce});}
export function renderStatic(items,produce){return renderToStaticMarkup(List,{items,produce});}`;
	const flags = ['OCTANE_COMPILE_FROZEN_AST', 'OCTANE_COMPILE_ASSERT_LOC'];
	const savedFlags = new Map(flags.map((flag) => [flag, process.env[flag]]));
	let compiled;
	try {
		for (const flag of flags) process.env[flag] = '1';
		compiled = compile(authored, path.join(root, 'benchmarks/scoped-signals/ServerFrames.tsrx'), {
			mode: 'server',
			dev,
			hmr: false,
		});
	} finally {
		for (const [flag, saved] of savedFlags) {
			if (saved === undefined) delete process.env[flag];
			else process.env[flag] = saved;
		}
	}
	const runtime = runtimeSource ?? (await readFile(path.join(source, 'runtime.server.ts'), 'utf8'));
	const once = (text, needle, replacement) => {
		assert.equal(text.split(needle).length, 2, needle);
		return text.replace(needle, replacement);
	};
	let observedRuntime = once(
		runtime,
		'function captureServerComponentContext() {',
		'function captureServerComponentContext() {\n globalThis.__serverFrameWork.envelopes++;',
	);
	observedRuntime = once(
		observedRuntime,
		'const previous = captureServerComponentContext();',
		`globalThis.__serverFrameWork.frames++;
 globalThis.__serverFrameWork.widths.push(Object.keys(frame).length);
 globalThis.__serverFrameWork.recipes += ${JSON.stringify(recipeFields)}.every(key=>Object.hasOwn(frame,key)) ? 1 : 0;
 const previous = captureServerComponentContext();`,
	);
	observedRuntime = observedRuntime.replace(
		/\bframe\.(?:signalParentKey|signalInvocationSite|signalListKeys|signalKey)\s*=/g,
		'globalThis.__serverFrameWork.recipeWrites++;\n $&',
	);
	observedRuntime = once(
		observedRuntime,
		'frame.signalInstanceKey = identity;',
		'globalThis.__serverFrameWork.cacheWrites++;\n if(!Object.hasOwn(frame,"signalInstanceKey"))globalThis.__serverFrameWork.cacheAppends++;\n frame.signalInstanceKey = identity;',
	);
	const manifest = JSON.parse(
		await readFile(path.join(sourceRoot, 'packages/octane/package.json')),
	);
	const bundle = async (observed) => {
		const result = await build({
			absWorkingDir: sourceRoot,
			stdin: {
				contents: compiled.code + '\nexport {__signalAt} from "octane/signals";',
				resolveDir: path.dirname(source),
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
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			plugins: [
				{
					name: 'selected-server-source',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
							const target = manifest.exports[request === 'octane' ? '.' : '.' + request.slice(6)];
							assert.equal(typeof target, 'string', request);
							return { path: path.resolve(path.dirname(source), target) };
						});
						plugin.onLoad({ filter: /\/runtime\.server\.ts$/ }, ({ path: file }) => {
							assert.equal(file, path.join(source, 'runtime.server.ts'));
							return {
								contents: observed ? observedRuntime : runtime,
								loader: 'ts',
								resolveDir: source,
							};
						});
					},
				},
			],
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
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__serverFrameWork');
	const window = new Window();
	const fragment = window.document.createElement('template');
	const exercise = async (code) => {
		const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
		let coercions = 0;
		const items = Array.from({ length: rows }, (_, index) => ({
			label: 'Row ' + index,
			key: {
				[Symbol.toPrimitive]() {
					coercions++;
					throw new Error('Object-key signal identities must not coerce user keys.');
				},
			},
		}));
		const snapshots = [];
		const capture = (response, order) => {
			fragment.innerHTML = response.html;
			const controls = [...fragment.content.querySelectorAll('input')];
			assert.deepEqual(
				controls.map((input) => input.value),
				order.map((item) => item.label),
			);
			assert.deepEqual(
				[...fragment.content.querySelectorAll('output')].map((output) => [
					output.textContent,
					output.title,
				]),
				order.map((item) => [item.label, item.label]),
			);
			return controls;
		};
		for (const order of [items, items.toReversed()]) {
			const response = api.render(order, (label) => label, { identifierPrefix: 'ordinary' });
			capture(response, order);
			assert.equal(response.signals, undefined);
			snapshots.push(response.html);
		}
		assert.equal(coercions, 0, 'Unused signal identity must not coerce raw object keys.');
		const ordinary = {
			...globalThis.__serverFrameWork,
			widths: [...globalThis.__serverFrameWork.widths],
		};
		if (potential) {
			for (const order of [items, items.toReversed()]) {
				const response = api.render(order, (label) =>
					api.__signalAt('i:server-frame-value', label),
				);
				const controls = capture(response, order);
				const identities = controls.map((input) =>
					input.getAttribute('data-octane-signal-control'),
				);
				assert.ok(identities.every((identity) => identity !== null));
				assert.equal(new Set(identities).size, rows);
				snapshots.push(response.html);
			}
			assert.equal(coercions, 0, 'Late first-handle reads must preserve opaque object keys.');
			const twins = api.renderTwins(items, (label) =>
				api.__signalAt('i:server-frame-value', label),
			);
			const controls = capture(twins, [...items, ...items]);
			const twinIdentities = controls.map((input) =>
				input.getAttribute('data-octane-signal-control'),
			);
			assert.ok(twinIdentities.every((identity) => identity !== null));
			assert.equal(
				new Set(twinIdentities).size,
				rows * 2,
				'Sibling list ancestors must retain independent handle identities.',
			);
			snapshots.push(twins.html);
		}
		// A public nested render must restore the outer ids and optional identity
		// state. The nested result is intentionally discarded by the authored read.
		let nested = false;
		const nestedResponse = api.render(
			items,
			(label) => {
				if (!nested) {
					nested = true;
					api.render([], (value) => value, { identifierPrefix: 'nested' });
				}
				return label;
			},
			{ identifierPrefix: 'outer' },
		);
		capture(nestedResponse, items);
		if (potential) assert.ok(nestedResponse.html.includes('outer'));
		snapshots.push(nestedResponse.html);
		const staticHtml = api.renderStatic(items, (label) => label).html;
		assert.ok(!staticHtml.includes('<!--[-->'));
		snapshots.push(staticHtml);
		return {
			ordinary,
			snapshots,
			usedKeyCoercions: coercions,
			cacheWrites: globalThis.__serverFrameWork.cacheWrites,
			cacheAppends: globalThis.__serverFrameWork.cacheAppends,
		};
	};
	try {
		const runs = [];
		for (const code of [clean, observed]) {
			Object.defineProperty(globalThis, '__serverFrameWork', {
				configurable: true,
				writable: true,
				value: {
					envelopes: 0,
					frames: 0,
					recipes: 0,
					recipeWrites: 0,
					cacheWrites: 0,
					cacheAppends: 0,
					widths: [],
				},
			});
			runs.push(await exercise(code));
		}
		assert.deepEqual(
			runs[1].snapshots,
			runs[0].snapshots,
			'Work observation must preserve all public output.',
		);
		return {
			dev,
			potential,
			rows,
			runtimeSha256: hash(runtime),
			fixtureSha256: hash(authored),
			compiledSha256: hash(compiled.code),
			clean: {
				raw: Buffer.byteLength(clean),
				gzip: gzipSync(clean, { level: 9 }).length,
				sha256: hash(clean),
			},
			work: { ...runs[1].ordinary, widths: [...new Set(runs[1].ordinary.widths)] },
			usedKeyCoercions: runs[1].usedKeyCoercions,
			cacheWrites: runs[1].cacheWrites,
			cacheAppends: runs[1].cacheAppends,
			snapshotSha256: hash(JSON.stringify(runs[1].snapshots)),
		};
	} finally {
		if (descriptor) Object.defineProperty(globalThis, '__serverFrameWork', descriptor);
		else delete globalThis.__serverFrameWork;
		window.close();
	}
}
