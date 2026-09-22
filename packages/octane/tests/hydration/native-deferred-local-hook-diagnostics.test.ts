// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import { build } from 'esbuild';
import { Window, type HTMLButtonElement, type HTMLSpanElement } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

const packageRoot = resolve(import.meta.dirname, '../..');
const filename = resolve(
	import.meta.dirname,
	'_fixtures/native-deferred-local-hook-diagnostics.tsrx',
);
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
					'\nexport { hydrateRoot, act, flushSync } from "octane";\nexport { beginNativeReadScope, enableNativeReadCollection } from "octane/internal/client";' +
					'\nexport { condition, load } from "octane/hydration";' +
					'\nexport * as compilerABI from "octane/internal/client"; export * as signalABI from "octane/signals/client";' +
					'\nexport {nativeLocalHook} from ' +
					JSON.stringify(packageRoot + '/src/runtime.ts') +
					';' +
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

async function scenario(dev: boolean, split: boolean, name: string, throwHistorical = false) {
	const view = await consumer(dev);
	expect('createNativeSignalDiagnosticInitializer' in view.api.compilerABI).toBe(false);
	expect('createNativeSignalDiagnosticInitializer' in view.api.signalABI).toBe(false);
	expect('createDiagnosticLocalScope' in view.api.signalABI).toBe(false);
	let root: any;
	const external = name.startsWith('external');
	const serverModel = external ? view.server.createModel$(true) : undefined;
	const model = external ? view.api.createModel$(true) : undefined;
	const recoverable: unknown[] = [];
	const renders: { observer: boolean; guarded: boolean; subscribers: number; leases: number }[] =
		[];
	const refs: any[] = [];
	const effects: string[] = [];
	let historicalThrows = 0;
	let rejectedAbi = 0;
	let rejectedWrites = 0;
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
				if (!observer) {
					if (model) {
						try {
							model.hidden$.set(true);
						} catch {
							rejectedWrites++;
						}
					}
					for (const call of [
						() => view.api.beginNativeReadScope(undefined, 2),
						() => view.api.enableNativeReadCollection(2),
					])
						try {
							call();
						} catch {
							rejectedAbi++;
						}
					if (throwHistorical) {
						historicalThrows++;
						throw new Error('Historical resource unavailable');
					}
				}
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
		const attributes = view.diagnostics.filter(({ args }) =>
			args.some((arg) => typeof arg === 'string' && arg.includes('attribute')),
		);
		const identity = attributes.filter(({ args }) =>
			args.some((arg) => typeof arg === 'string' && arg.includes('data-identity')),
		);
		const hidden = attributes.filter(({ args }) =>
			args.some(
				(arg) =>
					typeof arg === 'string' &&
					arg.includes('hidden') &&
					!arg.includes('synthetic-local-status'),
			),
		);
		expect(view.host.querySelector('#synthetic-control')).toBe(control);
		expect(control.getAttribute('data-identity')).toBe(latest.identity);
		expect(control.hidden).toBe(false);
		expect(recoverable).toEqual([]);
		expect(refs.filter(Boolean)).toEqual([control]);
		expect(refs.filter((node) => node && node.ownerDocument !== view.window.document)).toEqual([]);
		expect(effects).toEqual(['layout-mount', 'passive-mount']);
		expect(renders.every((render) => render.guarded)).toBe(true);
		if (dev) {
			const probes = renders.filter((render) => !render.observer);
			if (name !== 'external-only' || throwHistorical) expect(probes.length).toBeGreaterThan(0);
			expect(probes.every((render) => render.subscribers === 0)).toBe(true);
			expect(rejectedAbi).toBe(probes.length * 2);
			expect(rejectedWrites).toBe(model ? probes.length : 0);
		}
		if (throwHistorical) {
			expect(historicalThrows).toBe(1);
			expect(
				identity.length,
				JSON.stringify({ identity: identity.length, hidden: hidden.length }),
			).toBe(1);
			// The primitive site was not visited; native adoption still uses its SSR seed.
			expect(hidden).toHaveLength(0);
		} else if (dev && initialMismatch) {
			expect(identity).toHaveLength(1);
			expect(hidden).toHaveLength(0);
			expect(attributes).toHaveLength(1);
		} else {
			const classified = {
				count: view.diagnostics.length,
				hidden: hidden.length,
				identity: identity.length,
			};
			expect(view.diagnostics.length, JSON.stringify(classified)).toBe(0);
		}
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
for (const split of [false, true])
	it(`restores collection and lifecycle after a throwing ${split ? 'split' : 'unsplit'} historical probe`, () =>
		scenario(true, split, 'external-before-activation', true));

for (const dev of [true, false])
	for (const split of [true, false])
		for (const name of ['later-state', 'primitive-corrected', 'local-corrected'])
			it(`isolates local signal state dev=${dev} split=${split} ${name}`, async () => {
				const view = await consumer(dev);
				let root: any;
				const cells: { cell: any; probe: boolean }[] = [];
				const refs: any[] = [];
				const effects: string[] = [];
				let rejectedWrites = 0,
					rejectedSubscriptions = 0,
					rejectedUnknown = 0,
					unknownInitializations = 0,
					publications = 0;
				try {
					view.host.innerHTML = view.server.renderToString(
						split ? view.server.SplitBoundary : view.server.Boundary,
						{
							when: view.server.condition(false),
							identity: null,
							hidden: true,
							localInitial: false,
						},
					).html;
					const control = view.host.querySelector('#synthetic-control')! as HTMLButtonElement;
					const status = view.host.querySelector('#synthetic-local-status')! as HTMLSpanElement;
					const Component = split ? view.api.SplitBoundary : view.api.Boundary;
					const initial = {
						when: view.api.condition(false),
						identity: name === 'primitive-corrected' ? 'initial-client' : null,
						hidden: true,
						localInitial: name === 'local-corrected',
						onRef: (node: any) => refs.push(node),
						onEffect: (phase: string) => effects.push(phase),
						onRender() {
							if (view.api.getNativeReadObserver() === null) {
								for (const [hook, optional] of [
									['custom-native-resource', undefined],
									[
										'custom-native-resource',
										() => {
											unknownInitializations++;
											return {};
										},
									],
									[
										'useSignal$',
										() => {
											unknownInitializations++;
											return {};
										},
									],
								]) {
									try {
										view.api.nativeLocalHook(
											hook,
											() => {
												unknownInitializations++;
												return {};
											},
											() => {
												publications++;
											},
											Symbol.for('unsupported:' + hook + String(optional)),
											optional,
										);
									} catch {
										rejectedUnknown++;
									}
								}
							}
						},
						onLocal(cell: any) {
							const probe = view.api.getNativeReadObserver() === null;
							cells.push({ cell, probe });
							try {
								cell.set(true);
							} catch {
								rejectedWrites++;
							}
							try {
								cell.subscribe(() => publications++);
							} catch {
								rejectedSubscriptions++;
							}
							if (probe)
								expect(
									cell.owner.inspect().nodes.every((node: any) => node.subscribers === 0),
								).toBe(true);
							expect(cell.owner.inspect().adoptionLeases).toBe(0);
						},
					};
					root = view.api.hydrateRoot(view.host, Component, initial);
					await view.api.act(() => {});
					expect(cells).toEqual([]);
					expect(status.hidden).toBe(true);
					const latest = {
						...initial,
						when: view.api.load(),
						identity: name === 'later-state' ? 'later-client' : null,
						hidden: false,
						localInitial: name !== 'local-corrected',
					};
					await view.api.act(() => root.render(Component, latest));
					expect(view.host.querySelector('#synthetic-control')).toBe(control);
					expect(view.host.querySelector('#synthetic-local-status')).toBe(status);
					const probes = cells.filter((event) => event.probe),
						live = cells.filter((event) => !event.probe);
					expect(live.length).toBeGreaterThan(0);
					if (dev) expect(probes.length).toBeGreaterThan(0);
					else expect(probes).toEqual([]);
					expect(probes.every(({ cell }) => cell.owner.retired)).toBe(true);
					for (const { cell } of probes) expect(() => cell.set(false)).toThrow();
					const actual = live[0].cell;
					expect(live.every((event) => event.cell === actual)).toBe(true);
					expect(actual.owner.retired).toBe(false);
					expect(actual.get()).toBe(latest.localInitial);
					expect(status.hidden).toBe(!latest.localInitial);
					expect(rejectedWrites).toBe(cells.length);
					expect(rejectedSubscriptions).toBe(cells.length);
					expect(unknownInitializations).toBe(0);
					expect(publications).toBe(0);
					expect(rejectedUnknown).toBe(probes.length * 3);
					const identity = view.diagnostics.filter(({ args }) =>
							args.some((a) => typeof a === 'string' && a.includes('data-identity')),
						),
						hidden = view.diagnostics.filter(({ args }) =>
							args.some((a) => typeof a === 'string' && a.includes('hidden')),
						);
					expect(identity.length).toBe(dev && name === 'primitive-corrected' ? 1 : 0);
					expect(hidden.length).toBe(dev && name === 'local-corrected' ? 1 : 0);
					expect(view.diagnostics.length).toBe(dev && name !== 'later-state' ? 1 : 0);
					expect(refs.filter(Boolean)).toEqual([control]);
					expect(effects).toEqual(['layout-mount', 'passive-mount']);
					await view.api.act(() => control.click());
					expect(actual.get()).toBe(!latest.localInitial);
					expect(status.hidden).toBe(latest.localInitial);
					await view.api.act(() =>
						root.render(Component, { ...latest, localInitial: !latest.localInitial }),
					);
					expect(
						cells.filter((event) => !event.probe).every((event) => event.cell === actual),
					).toBe(true);
					expect(actual.get()).toBe(!latest.localInitial);
					expect(status.hidden).toBe(latest.localInitial);
					view.api.flushSync(() => root.unmount());
					root = null;
					await view.api.act(() => {});
					expect(cells.every((event) => event.cell.owner.retired)).toBe(true);
					expect(actual.owner.inspect().nodes).toEqual([]);
					expect(() => actual.get()).toThrow();
					expect(effects).toEqual([
						'layout-mount',
						'passive-mount',
						'layout-cleanup',
						'passive-cleanup',
					]);
					expect(refs.filter((node) => node === null)).toHaveLength(1);
					expect(publications).toBe(0);
				} finally {
					if (root) view.api.flushSync(() => root.unmount());
					view.close();
				}
			});

for (const dev of [true, false])
	for (const split of [true, false])
		it(`keeps lazy local initializers conservative dev=${dev} split=${split}`, async () => {
			const view = await consumer(dev);
			let root: any;
			let serverInitializations = 0,
				initializations = 0,
				subsequentInitializations = 0,
				probes = 0;
			const cells: any[] = [];
			const refs: any[] = [];
			const effects: string[] = [];
			try {
				const Server = split ? view.server.SplitBoundary : view.server.Boundary,
					Component = split ? view.api.SplitBoundary : view.api.Boundary;
				view.host.innerHTML = view.server.renderToString(Server, {
					when: view.server.condition(false),
					identity: null,
					hidden: true,
					localInitial: () => {
						serverInitializations++;
						return false;
					},
				}).html;
				expect(serverInitializations).toBe(1);
				const control = view.host.querySelector('#synthetic-control')! as HTMLButtonElement,
					status = view.host.querySelector('#synthetic-local-status')! as HTMLSpanElement;
				const initial = {
					when: view.api.condition(false),
					identity: null,
					hidden: true,
					localInitial: () => {
						initializations++;
						return false;
					},
					onRender() {
						if (view.api.getNativeReadObserver() === null) probes++;
					},
					onLocal(cell: any) {
						expect(view.api.getNativeReadObserver()).not.toBe(null);
						cells.push(cell);
					},
					onRef: (node: any) => refs.push(node),
					onEffect: (phase: string) => effects.push(phase),
				};
				root = view.api.hydrateRoot(view.host, Component, initial);
				await view.api.act(() => {});
				expect(initializations).toBe(0);
				expect(cells).toEqual([]);
				const latest = { ...initial, when: view.api.load(), identity: 'later-client' };
				await view.api.act(() => root.render(Component, latest));
				expect(initializations).toBe(1);
				expect(probes).toBe(dev ? 1 : 0);
				expect(cells.length).toBeGreaterThan(0);
				const actual = cells[0];
				expect(cells.every((cell) => cell === actual)).toBe(true);
				expect(actual.owner.retired).toBe(false);
				expect(actual.get()).toBe(false);
				expect(status.hidden).toBe(true);
				expect(view.host.querySelector('#synthetic-control')).toBe(control);
				expect(refs.filter(Boolean)).toEqual([control]);
				expect(effects).toEqual(['layout-mount', 'passive-mount']);
				const identity = view.diagnostics.filter(({ args }) =>
					args.some((a) => typeof a === 'string' && a.includes('data-identity')),
				);
				expect(identity.length).toBe(dev ? 1 : 0);
				expect(view.diagnostics.length).toBe(dev ? 1 : 0);
				await view.api.act(() => control.click());
				expect(actual.get()).toBe(true);
				expect(status.hidden).toBe(false);
				await view.api.act(() =>
					root.render(Component, {
						...latest,
						localInitial: () => {
							subsequentInitializations++;
							return false;
						},
					}),
				);
				expect(initializations).toBe(1);
				expect(subsequentInitializations).toBe(0);
				expect(cells.every((cell) => cell === actual)).toBe(true);
				expect(actual.get()).toBe(true);
				view.api.flushSync(() => root.unmount());
				root = null;
				await view.api.act(() => {});
				expect(actual.owner.retired).toBe(true);
				expect(actual.owner.inspect().nodes).toEqual([]);
				expect(() => actual.get()).toThrow();
				expect(effects).toEqual([
					'layout-mount',
					'passive-mount',
					'layout-cleanup',
					'passive-cleanup',
				]);
				expect(refs.filter((node) => node === null)).toHaveLength(1);
			} finally {
				if (root) view.api.flushSync(() => root.unmount());
				view.close();
			}
		});
