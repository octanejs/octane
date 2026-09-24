// @vitest-environment node

import { resolve } from 'node:path';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { compile, type KnownAttributeSpread } from 'octane/compiler';
import { createOctaneCompiler } from '../src/compiler/bundler.js';
import type { BindingHandle, BindingSource } from '../src/dom-bindings.js';

const packageRoot = resolve(import.meta.dirname, '..');
const fixture = resolve(packageRoot, 'HandoffHost.tsrx');
const provider: KnownAttributeSpread = {
	source: 'host-styles',
	imported: '*',
	members: ['attrs'],
	fields: ['class', 'style', 'data-style-src'],
};

function hostSource(nativeReads = false, spread = 'styles.attrs(props.styles)') {
	return `${nativeReads ? "import 'octane/signals';" : ''}
import { unbound } from 'octane/behavior';
import * as styles from 'host-styles';
export function Host(props) @{ 'use dom bindings';
 <section {...unbound(${spread})} data-active={props.active ? '' : undefined}>{unbound(props.children)}</section>
}
export function Application(props) @{
 <Host styles={props.styles} active={props.active}><span>{props.label as string}</span></Host>
}`;
}

async function bundle(source: string, mode: 'client' | 'server', dev: boolean, proof = provider) {
	const compiler = createOctaneCompiler({
		root: packageRoot,
		hmr: false,
		dev,
		knownAttributeSpreads: [proof],
	});
	const entry =
		mode === 'server'
			? `export { renderToString } from 'octane/server';
export { Application } from './HandoffHost.tsrx';`
			: `export { hydrateRoot, flushSync } from 'octane';
import { adoptBindings } from 'octane/behavior';
import { Host } from './HandoffHost.tsrx';
export { Application } from './HandoffHost.tsrx';
export function attach(root, source) { return adoptBindings(root, Host, source); }`;
	const result = await build({
		stdin: {
			contents: compiler.transform(entry, resolve(packageRoot, 'handoff-entry.tsrx'), {
				environment: mode,
			})!.code,
			loader: 'js',
			resolveDir: packageRoot,
		},
		bundle: true,
		write: false,
		format: mode === 'client' ? 'iife' : 'esm',
		...(mode === 'client' ? { globalName: 'handoffFixture' } : {}),
		platform: mode === 'client' ? 'browser' : 'node',
		target: 'esnext',
		minify: !dev,
		logLevel: 'silent',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'compiled-handoff-consumer',
				setup(bundler) {
					bundler.onResolve({ filter: /^\.\/HandoffHost\.tsrx(?:\?.*)?$/ }, ({ path }) => ({
						path,
						namespace: 'handoff-host',
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'handoff-host' }, ({ path }) => {
						const query = path.includes('?') ? path.slice(path.indexOf('?')) : '';
						return {
							contents: compiler.transform(source, fixture + query, { environment: mode })!.code,
							loader: 'js',
							resolveDir: packageRoot,
						};
					});
					bundler.onResolve({ filter: /^host-styles$/ }, () => ({
						path: 'host-styles',
						namespace: 'handoff-provider',
					}));
					bundler.onLoad({ filter: /.*/, namespace: 'handoff-provider' }, () => ({
						contents: 'export function attrs(value) { return value; }',
						loader: 'js',
					}));
				},
			},
		],
	});
	return result.outputFiles[0].text + `\n//# sourceURL=octane-handoff-${mode}-bundle.js`;
}

type Client = {
	Application: any;
	attach(root: Element, source: BindingSource<any>): BindingHandle;
	hydrateRoot: typeof import('../src/index.js').hydrateRoot;
	flushSync: typeof import('../src/index.js').flushSync;
};

async function consumer(source: string, dev: boolean, proof = provider) {
	const [serverCode, clientCode] = await Promise.all([
		bundle(source, 'server', dev, proof),
		bundle(source, 'client', dev, proof),
	]);
	const server = await import(
		`data:text/javascript;base64,${Buffer.from(serverCode).toString('base64')}`
	);
	const dom = new JSDOM('<!doctype html><div id="root"></div>', {
		runScripts: 'outside-only',
		url: 'https://octane.test/',
	});
	dom.window.eval(clientCode);
	const api = (dom.window as unknown as { handoffFixture: Client }).handoffFixture;
	const container = dom.window.document.getElementById('root')!;
	let snapshot = {
		active: false,
		styles: { class: 'server-style', style: { color: 'red' }, 'data-style-src': 'server' },
		label: 'Server child',
	};
	container.innerHTML = server.renderToString(server.Application, snapshot).html;
	const listeners = new Set<() => void>();
	const cleanup = vi.fn();
	const state = {
		getSnapshot: () => snapshot,
		subscribe(notify: () => void) {
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
				cleanup();
			};
		},
	};
	return {
		dom,
		api,
		container,
		state,
		cleanup,
		publish(next: Partial<typeof snapshot>) {
			snapshot = { ...snapshot, ...next };
			for (const notify of listeners) notify();
		},
	};
}

describe('bundled native host binding handoff', () => {
	for (const dev of [false, true]) {
		for (const nativeReads of [false, true]) {
			it(`preserves external styles and children with ${dev ? 'development' : 'production'} runtime and compiler (native reads: ${nativeReads})`, async () => {
				const fixture = await consumer(hostSource(nativeReads), dev);
				const { dom, api, container, state, cleanup, publish } = fixture;
				const section = container.querySelector('section')!;
				const child = section.firstElementChild;
				const error = vi.spyOn(dom.window.console, 'error');
				const warn = vi.spyOn(dom.window.console, 'warn');
				let binding: BindingHandle | undefined;
				let root: ReturnType<Client['hydrateRoot']> | undefined;
				try {
					binding = api.attach(section, state);
					publish({ active: true });
					expect(section.hasAttribute('data-active')).toBe(true);
					expect(section.style.color).toBe('red');
					root = api.hydrateRoot(container, api.Application, state.getSnapshot(), {
						bindingLeases: [binding],
					});
					api.flushSync(() => {});
					expect(container.querySelector('section')).toBe(section);
					expect(section.firstElementChild).toBe(child);
					expect(section.hasAttribute('data-active')).toBe(true);
					expect(cleanup).toHaveBeenCalledOnce();
					publish({ active: false });
					binding.refresh();
					expect(section.hasAttribute('data-active')).toBe(true);
					api.flushSync(() =>
						root!.render(api.Application, {
							active: false,
							styles: { class: 'live-style', style: { color: 'blue' }, 'data-style-src': 'live' },
							label: 'Live child',
						}),
					);
					expect(section.firstElementChild).toBe(child);
					expect(section.textContent).toBe('Live child');
					expect(section.className).toBe('live-style');
					expect(section.style.color).toBe('blue');
					expect(section.getAttribute('data-style-src')).toBe('live');
					expect(section.hasAttribute('data-active')).toBe(false);
					expect(error).not.toHaveBeenCalled();
					expect(warn).not.toHaveBeenCalled();
				} finally {
					try {
						binding?.dispose();
						root?.unmount();
					} finally {
						error.mockRestore();
						warn.mockRestore();
						dom.window.close();
					}
				}
				expect(cleanup).toHaveBeenCalledOnce();
			});
		}

		for (const matched of [false, true]) {
			it(`rejects ${matched ? 'an unknown spread' : 'a mismatched provider contract'} with ${dev ? 'development' : 'production'} runtime`, async () => {
				const { dom, api, container, state, cleanup, publish } = await consumer(
					matched ? hostSource(false, 'props.styles') : hostSource(),
					dev,
					matched ? provider : { ...provider, members: ['other'] },
				);
				const section = container.querySelector('section')!;
				let binding: BindingHandle | undefined;
				try {
					binding = api.attach(section, state);
					publish({ active: true });
					expect(() =>
						api.hydrateRoot(container, api.Application, state.getSnapshot(), {
							bindingLeases: [binding!],
						}),
					).toThrow(/active fixed native views|errors\/77/);
					expect(cleanup).not.toHaveBeenCalled();
					expect(section.hasAttribute('data-active')).toBe(true);
					expect(section.className).toBe('server-style');
				} finally {
					binding?.dispose();
					dom.window.close();
				}
				expect(cleanup).toHaveBeenCalledOnce();
			});
		}

		it(`retains external field ownership checks (${dev ? 'dev' : 'prod'} compiler)`, () => {
			for (const mode of ['client', 'server'] as const) {
				const options = { mode, dev, hmr: false, knownAttributeSpreads: [provider] };
				for (const fields of [['data-active'], ['children'], ['data-octane-bindings']]) {
					expect(() =>
						compile(hostSource(), fixture, {
							...options,
							knownAttributeSpreads: [{ ...provider, fields }],
						}),
					).toThrow(/owned attribute|Invalid knownAttributeSpreads/);
				}
			}
		});
	}
});
