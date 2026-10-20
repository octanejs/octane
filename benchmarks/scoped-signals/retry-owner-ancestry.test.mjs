import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { compile } from '../../packages/octane/src/compiler/compile.js';

const repo = path.resolve(import.meta.dirname, '../..');
const depth = 64;
const layers = Array.from(
	{ length: depth },
	(_, index) =>
		`function Layer${index}({ id }) @{ <section><${index + 1 === depth ? 'Leaf' : `Layer${index + 1}`} id={id} /></section> }`,
).join('\n');
const app = (name, layer) => `export function ${name}({ active$, load }) @{
	const live$ = useSignal$(true);
	<main data-live={live$.get()}>
		@if (active$.get()) {
			<>@for (const id of [0, 1, 2, 3]; key id) { <Layer${layer} id={id} /> } <Data load={load} /></>
		} @else { <p>idle</p> }
	</main>
}`;
const source = `import { query$ } from 'octane/signals';
import { useSignal$ } from 'octane/signals/client';
function Leaf({ id }) @{ const value$ = useSignal$(id); <button>{String(value$.get())}</button> }
${layers}
function Data({ load }) @{ const result$ = query$(() => true, load); <output>{String(result$.get())}</output> }
${app('Shallow', 48)}
${app('Deep', 0)}
export { act, createRoot, startTransition } from 'octane';
export { createScope } from 'octane/signals';`;

test('retrying deeper signal-owner trees bounds ancestry copying', async (t) => {
	const { code } = compile(source, path.join(repo, 'retry-owner-ancestry.tsrx'), {
		mode: 'client',
		dev: false,
		hmr: false,
		strong: true,
	});
	const result = await build({
		stdin: { contents: code, resolveDir: repo },
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	});
	const window = new Window();
	const globals = new Map();
	for (const name of [
		'window',
		'document',
		'Node',
		'Element',
		'HTMLElement',
		'Text',
		'Comment',
		'Event',
	]) {
		globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'window' ? window : window[name],
		});
	}
	try {
		const api = await import(
			`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
		);
		async function run(App, observed) {
			const scope = api.createScope({ scopeKey: 'retry-owner-ancestry' });
			const active$ = scope.signal$('active', false);
			const pending = Promise.withResolvers();
			let loads = 0;
			const load = () => {
				loads++;
				return pending.promise;
			};
			const host = window.document.createElement('div');
			window.document.body.append(host);
			let root = api.createRoot(host);
			const original = Array.prototype.concat;
			let copied = 0;
			try {
				await api.act(() => root.render(App, { active$, load }));
				if (observed)
					Array.prototype.concat = function (...args) {
						copied += this.length;
						for (const arg of args) copied += Array.isArray(arg) ? arg.length : 1;
						return Reflect.apply(original, this, args);
					};
				await api.act(() => api.startTransition(() => active$.set(true)));
				const held = host.textContent;
				await api.act(() => pending.resolve('ready'));
				Array.prototype.concat = original;
				const visible = {
					held,
					output: host.querySelector('output')?.textContent,
					rows: Array.from(host.querySelectorAll('button'), (button) => button.textContent),
					loads,
				};
				root.unmount();
				root = undefined;
				assert.equal(host.childNodes.length, 0);
				return { copied, visible };
			} finally {
				Array.prototype.concat = original;
				root?.unmount();
				scope.dispose();
				host.remove();
			}
		}
		const clean = await run(api.Deep, false);
		const shallow = await run(api.Shallow, true);
		const deep = await run(api.Deep, true);
		assert.deepEqual(clean.visible, {
			held: 'idle',
			output: 'ready',
			rows: ['0', '1', '2', '3'],
			loads: 1,
		});
		assert.deepEqual(shallow.visible, clean.visible);
		assert.deepEqual(deep.visible, clean.visible);
		t.diagnostic(`concat entries: depth 16 ${shallow.copied}; depth 64 ${deep.copied}`);
		// Allow a small fixed amount of incidental work in the measured transition window.
		assert.ok(
			deep.copied <= shallow.copied + 16,
			'four times the depth should not meaningfully increase copied entries',
		);
	} finally {
		window.close();
		for (const [name, descriptor] of globals) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
	}
});
