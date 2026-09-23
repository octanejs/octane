// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { Window, type HTMLButtonElement } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const packageRoot = resolve(import.meta.dirname, '../..');
const filename = resolve(import.meta.dirname, '_fixtures/split-hydrate-native-diagnostics.tsrx');
const authored = readFileSync(filename, 'utf8');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8'));
const exports = Object.fromEntries(
	Object.entries(pkg.exports).map(([name, target]: [string, any]) => [
		name === '.' ? 'octane' : 'octane' + name.slice(1),
		resolve(packageRoot, typeof target === 'string' ? target : target.default),
	]),
);
const bundles = new Map<boolean, Promise<{ server: any; code: string }>>();

function bundle(dev: boolean) {
	let cached = bundles.get(dev);
	if (cached !== undefined) return cached;
	cached = (async () => {
		const common = {
			bundle: true,
			write: false as const,
			target: 'esnext',
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			plugins: [
				{
					name: 'native-diagnostic-source-consumer',
					setup(builder: any) {
						builder.onResolve({ filter: /\?octane-hydrate=/ }, (args: any) => ({
							path: resolve(args.resolveDir, args.path),
							namespace: 'authored-hydrate-query',
						}));
						builder.onLoad({ filter: /.*/, namespace: 'authored-hydrate-query' }, (args: any) => ({
							contents: compile(authored, args.path, { dev, hmr: false, strong: true }).code,
							loader: 'js',
							resolveDir: resolve(import.meta.dirname, '_fixtures'),
						}));
						builder.onResolve({ filter: /^octane(?:$|\/)/ }, (args: any) => {
							if (!(args.path in exports)) throw new Error('Unexpected Octane subpath');
							return { path: exports[args.path] };
						});
					},
				},
			],
		};
		const serverCode = await build({
			...common,
			stdin: {
				contents:
					compile(authored, filename, { dev, hmr: false, strong: true, mode: 'server' }).code +
					'\nexport { renderToString } from "octane/server";\nexport { condition } from "octane/hydration";',
				resolveDir: resolve(import.meta.dirname, '_fixtures'),
				loader: 'js',
			},
			platform: 'node',
			format: 'esm',
		});
		const server = await import(
			'data:text/javascript;base64,' +
				Buffer.from(serverCode.outputFiles[0].text).toString('base64')
		);
		const result = await build({
			...common,
			stdin: {
				contents:
					compile(authored, filename, { dev, hmr: false, strong: true }).code +
					'\nexport { hydrateRoot, act, flushSync } from "octane";' +
					'\nexport { condition, load } from "octane/hydration";' +
					'\nexport { getNativeReadObserver, isNativeWriteGuarded } from ' +
					JSON.stringify(resolve(packageRoot, 'src/signals/read-protocol.ts')) +
					';',
				resolveDir: resolve(import.meta.dirname, '_fixtures'),
				loader: 'js',
			},
			platform: 'browser',
			format: 'iife',
			globalName: '__NATIVE_DIAGNOSTIC__',
		});
		return { server, code: result.outputFiles[0].text };
	})();
	bundles.set(dev, cached);
	return cached;
}

async function consumer(dev: boolean) {
	const saved = await bundle(dev);
	const window = new Window({ settings: { enableJavaScriptEvaluation: true } });
	const diagnostics: { level: string; args: unknown[] }[] = [];
	for (const level of ['warn', 'error'] as const)
		window.console[level] = (...args) => diagnostics.push({ level, args });
	const channels: MessageChannel[] = [];
	class ConsumerChannel extends MessageChannel {
		constructor() {
			super();
			channels.push(this);
		}
	}
	(window as any).MessageChannel = ConsumerChannel;
	window.document.body.innerHTML = '<div id="host"></div>';
	window.eval(saved.code);
	return {
		server: saved.server,
		api: (window as any).__NATIVE_DIAGNOSTIC__,
		window,
		host: window.document.getElementById('host')!,
		diagnostics,
		close() {
			for (const channel of channels) {
				channel.port1.close();
				channel.port2.close();
			}
			window.close();
		},
	};
}

async function scenario(dev: boolean, split: boolean, name: string) {
	const view = await consumer(dev);
	let root: any;
	const external = name.startsWith('external');
	const serverModel = external ? view.server.createModel$(true) : undefined;
	const model = external ? view.api.createModel$(true) : undefined;
	const recoverable: unknown[] = [];
	const renders: { observer: boolean; guarded: boolean; subscribers: number; leases: number }[] =
		[];
	const refs: any[] = [];
	const effects: string[] = [];
	const Component = split ? view.api.SplitBoundary : view.api.Boundary;
	try {
		view.host.innerHTML = view.server.renderToString(
			split ? view.server.SplitBoundary : view.server.Boundary,
			{ when: view.server.condition(false), identity: null, hidden: true, model: serverModel },
		).html;
		const control = view.host.querySelector('#synthetic-control')! as HTMLButtonElement;
		const initialMismatch = name === 'corrected-initial';
		const initial = {
			when: view.api.condition(false),
			identity: initialMismatch ? 'initial-client' : null,
			hidden: true,
			model,
			onRender() {
				const observer = view.api.getNativeReadObserver() !== null;
				const inspection = model?.inspect();
				renders.push({
					observer,
					guarded: view.api.isNativeWriteGuarded(),
					subscribers:
						inspection?.nodes.reduce((sum: number, node: any) => sum + node.subscribers, 0) ?? 0,
					leases: inspection?.adoptionLeases ?? 0,
				});
			},
			onRef: (node: any) => refs.push(node),
			onEffect: (phase: string) => effects.push(phase),
		};
		root = view.api.hydrateRoot(view.host, Component, initial, {
			onRecoverableError: (error: unknown) => recoverable.push(error),
		});
		await view.api.act(() => {});
		expect(control.hidden).toBe(true);
		expect(refs).toEqual([]);
		expect(effects).toEqual([]);
		if (model) await view.api.act(() => model.hidden$.set(false));
		const latest = {
			...initial,
			when: view.api.load(),
			identity: initialMismatch || name === 'external-only' ? null : 'later-client',
			hidden: false,
		};
		await view.api.act(() => root.render(Component, latest));
		expect(view.host.querySelector('#synthetic-control')).toBe(control);
		expect(control.getAttribute('data-identity')).toBe(latest.identity);
		expect(control.hidden).toBe(false);
		expect(recoverable).toEqual([]);
		expect(refs.filter(Boolean)).toEqual([control]);
		expect(refs.filter((node) => node && node.ownerDocument !== view.window.document)).toEqual([]);
		expect(effects).toEqual(['layout-mount', 'passive-mount']);
		// Dev and prod render the child only live, inside native read collection:
		// there is no side render of the dormant boundary's earlier captures.
		expect(renders.length).toBeGreaterThan(0);
		expect(renders.every((render) => render.guarded && render.observer)).toBe(true);
		// Every activation here follows changed captures or a changed native value,
		// so the server HTML is repaired without reporting a mismatch.
		expect(view.diagnostics).toEqual([]);
		if (model) {
			await view.api.act(() => model.hidden$.set(true));
			expect(control.hidden).toBe(true);
			await view.api.act(() => model.hidden$.set(false));
			expect(control.hidden).toBe(false);
		}
		view.api.flushSync(() => root.unmount());
		root = null;
		await view.api.act(() => {});
		expect(effects).toEqual(['layout-mount', 'passive-mount', 'layout-cleanup', 'passive-cleanup']);
		expect(refs.filter((node) => node === null)).toHaveLength(1);
		expect(view.host.childNodes).toHaveLength(0);
		if (model) {
			const inspection = model.inspect();
			expect(inspection.adoptionLeases).toBe(0);
			expect(inspection.nodes.reduce((sum: number, node: any) => sum + node.subscribers, 0)).toBe(
				0,
			);
			model.hidden$.set(true);
			expect(view.host.childNodes).toHaveLength(0);
		}
	} finally {
		if (root) view.api.flushSync(() => root.unmount());
		model?.dispose();
		serverModel?.dispose();
		view.close();
	}
}

for (const dev of [false, true])
	describe(`${dev ? 'development' : 'production'} native deferred diagnostics`, () => {
		for (const split of [false, true])
			for (const name of [
				'later-primitive',
				'external-before-activation',
				'external-only',
				'corrected-initial',
			])
				it(`${split ? 'split' : 'unsplit'} ${name}`, () => scenario(dev, split, name));
	});
