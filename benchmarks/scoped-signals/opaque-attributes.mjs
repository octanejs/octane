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

export async function measureOpaqueAttributes({
	sourceRoot = root,
	dev = false,
	extension = 'tsrx',
	updates = 100,
	attributeCount = 1,
} = {}) {
	const source = path.join(sourceRoot, 'packages/octane/src');
	const { compile } = await import(pathToFileURL(path.join(source, 'compiler/compile.js')).href);
	assert.ok(Number.isInteger(attributeCount) && attributeCount > 0);
	const attributes = Array.from(
		{ length: attributeCount },
		(_, index) => `${index === 0 ? 'title' : `data-attr-${index}`}={props.read()}`,
	).join(' ');
	const authored = `import {createRoot,flushSync} from 'octane';
export {flushSync};
export {createScope} from 'octane/signals';
function View(props) ${extension === 'tsrx' ? '@' : ''}{ ${extension === 'tsx' ? 'return ' : ''}<section ${attributes}><p>{String(props.tick)}</p><input value={props.control}/><input type="checkbox" checked={props.checked}/></section>${extension === 'tsx' ? ';' : ''} }
export function mount(parent) {
 const root=createRoot(parent);
 return {update(props){flushSync(()=>root.render(View,props));},dispose(){root.unmount();}};
}`;
	const fixtureId = path.join(root, 'benchmarks/scoped-signals', `OpaqueAttributes.${extension}`);
	const flags = ['OCTANE_COMPILE_FROZEN_AST', 'OCTANE_COMPILE_ASSERT_LOC'];
	const previousFlags = new Map(flags.map((flag) => [flag, process.env[flag]]));
	let compiled;
	try {
		for (const flag of flags) process.env[flag] = '1';
		compiled = compile(authored, fixtureId, { mode: 'client', dev, hmr: false });
	} finally {
		for (const [flag, previous] of previousFlags) {
			if (previous === undefined) delete process.env[flag];
			else process.env[flag] = previous;
		}
	}
	const runtime = await readFile(path.join(source, 'runtime.ts'), 'utf8');
	const declaration = /export function bindSignalAttribute\([\s\S]*?\): unknown \{/;
	assert.equal(runtime.match(new RegExp(declaration.source, 'g'))?.length, 1);
	let observedRuntime = runtime.replace(
		declaration,
		'$&\n globalThis.__opaqueAttributeWork.calls++;',
	);
	const policyDeclaration = /function bindDirectSignal\([\s\S]*?\): unknown \{/;
	assert.equal(runtime.match(new RegExp(policyDeclaration.source, 'g'))?.length, 1);
	observedRuntime = observedRuntime.replace(
		policyDeclaration,
		'$&\n if (policy.kind === "attribute") globalThis.__opaqueAttributeWork.policies++;',
	);
	const bundle = async (observed) => {
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
				'octane/signals': path.join(source, 'signals/index.ts'),
				octane: path.join(source, 'index.ts'),
			},
			define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
			plugins: observed
				? [
						{
							name: 'attribute-work',
							setup(plugin) {
								plugin.onLoad({ filter: /\/runtime\.ts$/ }, ({ path: file }) => {
									assert.equal(file, path.join(source, 'runtime.ts'));
									return { contents: observedRuntime, loader: 'ts', resolveDir: source };
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
		return result.outputFiles[0].text;
	};
	const clean = await bundle(false);
	const observed = await bundle(true);
	const window = new Window();
	const globals = new Map();
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
		'__opaqueAttributeWork',
	]) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value:
				name === 'window'
					? window
					: name === '__opaqueAttributeWork'
						? { calls: 0, policies: 0 }
						: window[name],
		});
	}
	const exercise = async (code) => {
		const api = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
		const host = window.document.createElement('div');
		window.document.body.append(host);
		const mounted = api.mount(host);
		const scope = api.createScope({ scopeKey: 'opaque-attributes' });
		let reads = 0;
		let tick = 0;
		let value = 'initial';
		const update = () =>
			mounted.update({
				read: () => (reads++, value),
				tick: tick++,
				control: 'fixed',
				checked: true,
			});
		const count = (work) => {
			globalThis.__opaqueAttributeWork.calls = 0;
			globalThis.__opaqueAttributeWork.policies = 0;
			work();
			return {
				helperEntries: globalThis.__opaqueAttributeWork.calls,
				policyEntries: globalThis.__opaqueAttributeWork.policies,
			};
		};
		try {
			update();
			const section = host.querySelector('section');
			const paragraph = host.querySelector('p');
			const input = host.querySelector('input');
			const checkbox = host.querySelector('[type="checkbox"]');
			const steady = count(() => {
				for (let i = 0; i < updates; i++) {
					input.value = 'edited';
					checkbox.checked = false;
					update();
					assert.equal(input.value, 'fixed');
					assert.equal(checkbox.checked, true);
				}
			});
			assert.equal(section.title, 'initial');
			assert.equal(reads, (updates + 1) * attributeCount);
			const changed = count(() => {
				value = 'changed';
				update();
			});
			assert.equal(section.title, 'changed');
			const nan = count(() => {
				value = NaN;
				update();
				update();
			});
			assert.equal(section.title, 'NaN');
			const undefinedCalls = count(() => {
				value = undefined;
				update();
				update();
			});
			assert.equal(section.hasAttribute('title'), false);
			const object = { toString: () => 'object' };
			const objects = count(() => {
				value = object;
				update();
				update();
			});
			assert.equal(section.title, 'object');
			const callback = () => {};
			const functions = count(() => {
				value = callback;
				update();
				update();
			});
			assert.equal(section.hasAttribute('title'), false);
			const signal = scope.signal$('value', 'signal');
			const handles = count(() => {
				value = signal;
				update();
				update();
			});
			assert.equal(section.title, 'signal');
			api.flushSync(() => signal.set('live'));
			assert.equal(section.title, 'live');
			value = 'detached';
			update();
			api.flushSync(() => signal.set('obsolete'));
			assert.equal(section.title, 'detached');
			assert.equal(host.querySelector('section'), section);
			assert.equal(host.querySelector('p'), paragraph);
			assert.equal(host.querySelector('input'), input);
			assert.equal(paragraph.textContent, String(tick - 1));
			const snapshot = { html: host.innerHTML, reads, tick };
			mounted.dispose();
			assert.equal(host.childNodes.length, 0);
			api.flushSync(() => signal.set('after disposal'));
			assert.equal(section.title, 'detached');
			return { steady, changed, nan, undefinedCalls, objects, functions, handles, snapshot };
		} finally {
			mounted.dispose();
			scope.dispose();
			host.remove();
		}
	};
	try {
		const plain = await exercise(clean);
		const work = await exercise(observed);
		assert.deepEqual(work.snapshot, plain.snapshot, 'Observation preserves public semantics.');
		return {
			dev,
			extension,
			fixtureId,
			updates,
			attributeCount,
			...work,
			bytes: Buffer.byteLength(clean),
			gzip: gzipSync(clean, { level: 9 }).length,
			sourceHashes: {
				fixture: hash(authored),
				compile: hash(await readFile(path.join(source, 'compiler/compile.js'))),
				runtime: hash(runtime),
				compiled: hash(compiled.code),
				bundle: hash(clean),
			},
		};
	} finally {
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		window.close();
	}
}
