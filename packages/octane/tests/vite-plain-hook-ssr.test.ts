// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Window } from 'happy-dom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { octane } from 'octane/compiler/vite';

// Custom hooks in a plain `.ts` module, server-rendered and hydrated through
// real Vite builds. The aliased build pins bare `octane` to the client entry,
// as checkout-pinned benchmark harnesses do. Vite applies that alias before the
// plugin's resolveId, so the server graph must name its runtime in the source.
const files = {
	'hooks.ts': `import { createContext, useContext, useId, useMemo, useState, useSyncExternalStore } from 'octane';
export const Theme = createContext('light');
export function createStore(value: string) {
	const listeners = new Set<() => void>();
	return {
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		get: () => value,
		set(next: string) {
			value = next;
			for (const listener of listeners) listener();
		},
	};
}
export function useValue(store: ReturnType<typeof createStore>) {
	return useSyncExternalStore(store.subscribe, store.get, store.get);
}
export function useLabel(store: ReturnType<typeof createStore>) {
	const value = useValue(store);
	const [count] = useState(2);
	const doubled = useMemo(() => count * 2, [count]);
	return value + ':' + doubled + ':' + useContext(Theme);
}
export function useLabelId() {
	return useId();
}`,
	'App.tsrx': `import { createStore, Theme, useLabel, useLabelId } from './hooks.ts';
export const store = createStore('server');
function Label() @{
	const id = useLabelId();
	<p id={id}>{useLabel(store) as string}</p>
}
export function App() @{
	<Theme value="dark"><Label /></Theme>
}`,
	'entry.ts': `export { App, store } from './App.tsrx';
export { act, flushSync, hydrateRoot } from 'octane';`,
	'entry.server.ts': `export { App } from './App.tsrx';
export { renderToString } from 'octane/server';`,
};

type Server = { App: unknown; renderToString: (...args: any[]) => { html: string } };
type Build = { client: string; server: Server };
const builds = new Map<string, Build>();
let root: string;

beforeAll(async () => {
	root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-plain-hook-ssr-')));
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(resolve(import.meta.dirname, '..'), join(root, 'node_modules/octane'), 'dir');
	writeFileSync(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
	for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source);
	for (const variant of ['resolved', 'aliased']) {
		const outputs: string[] = [];
		for (const ssr of [false, true]) {
			const result = await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [octane({ hmr: false, ssr })],
				resolve:
					variant === 'aliased'
						? {
								alias: [
									{
										find: /^octane$/,
										replacement: resolve(import.meta.dirname, '../src/index.ts'),
									},
								],
							}
						: {},
				define: { 'process.env.NODE_ENV': '"production"' },
				ssr: { noExternal: true },
				build: {
					write: false,
					minify: false,
					...(ssr
						? { ssr: join(root, 'entry.server.ts') }
						: {
								lib: { entry: join(root, 'entry.ts'), formats: ['iife' as const], name: 'fixture' },
							}),
				},
			});
			const chunks = (Array.isArray(result) ? result : [result]).flatMap((output) =>
				'output' in output ? output.output : [],
			);
			const chunk = chunks.find((item) => item.type === 'chunk');
			if (!chunk || chunk.type !== 'chunk') throw new Error('Expected a bundled fixture.');
			outputs.push(chunk.code);
		}
		builds.set(variant, {
			client: outputs[0],
			server: await import(
				`data:text/javascript;base64,${Buffer.from(outputs[1]).toString('base64')}`
			),
		});
	}
}, 60_000);

afterAll(() => {
	if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

describe('plain .ts custom hooks through Vite SSR', () => {
	it.each(['resolved', 'aliased'])(
		'server-renders and hydrates the %s runtime',
		async (variant) => {
			const { client, server } = builds.get(variant)!;
			const { html } = server.renderToString(server.App, {});
			const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
			Object.assign(window, { MessageChannel: globalThis.MessageChannel });
			try {
				window.document.body.innerHTML = `<div id="host">${html}</div>`;
				window.eval(client);
				// The store subscribes in a passive effect, which runs after an animation
				// frame and a message. act() drains it; a fixed delay can lose that race.
				const result = await window.eval(`(async () => {
 const { App, act, store, flushSync, hydrateRoot } = fixture;
 const host = document.querySelector('#host'), server = host.querySelector('p'), errors = [];
 const rendered = { text: server.textContent, id: server.id !== '' };
 const root = hydrateRoot(host, App, {}, { onRecoverableError: (error) => errors.push(String(error)) });
 await act(() => {});
 const hydrated = { html: host.innerHTML, adopted: host.querySelector('p') === server, errors };
 flushSync(() => store.set('client'));
 const updated = host.textContent;
 root.unmount();
 return { rendered, hydrated, updated };
})()`);
				expect(result).toEqual({
					rendered: { text: 'server:4:dark', id: true },
					hydrated: { html, adopted: true, errors: [] },
					updated: 'client:4:dark',
				});
			} finally {
				window.close();
			}
		},
	);
});
