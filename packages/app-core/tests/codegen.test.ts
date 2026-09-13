// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, transform } from 'esbuild';
import { Window } from 'happy-dom';
import {
	bootstrapStreamedSignalHydration,
	installSignalDocumentLifecycle,
	type StreamedSignalHydration,
	type StreamedSignalHydrationOptions,
} from '../../octane/src/hydration/streamed-signals.js';
import { enableSignalBindings } from '../../octane/src/runtime.js';
import {
	enableServerSignalBindings,
	renderToReadableStream,
} from '../../octane/src/runtime.server.js';
import { __queryAt, runWithSignalOwner, type SignalOwner } from '../../octane/src/signals/index.js';
import {
	bootstrapIndependentHydration,
	createIndependentHydrateManifest,
	initializeHydrationEventCapture,
	serializeIndependentHydrateManifest,
	type IndependentHydrateActivationContext,
	type IndependentHydrateBootstrapOptions,
} from '../../octane/src/hydration/index.js';
import { RenderRoute } from '../src/routes.js';
import {
	SERVER_ONLY_ADAPTER_IDS,
	create_client_entry_source,
	create_adapter_browser_stub_source,
	generateServerEntry,
	generateServerManifestEntry,
	normalize_module_reference,
} from '../src/codegen.js';

afterEach(() => vi.unstubAllGlobals());

// Execute the complete generated entry with real event capture and discovery.
// Mock only the route renderer and import boundaries, not the bootstrap's decisions.
async function runClientEntry(
	registry: 'static' | 'global' | 'none' | 'empty-global' | 'capability',
	options: {
		clientBuildId?: string;
		clientBuild?: {
			version: number;
			buildId: string;
			mode: string;
			capabilities: { independentHydration: boolean };
		};
		streamed?: { documentId: string; html: string; read: () => unknown };
		devCapability?: boolean;
		widgetModuleReady?: Promise<void>;
		documentId?: string;
		fails?: boolean;
	} = {},
) {
	const styleRequests: { url: string; respond: (status: number) => void }[] = [];
	const window = new Window({
		url: 'https://example.test/',
		settings: {
			fetch: {
				interceptor: {
					beforeAsyncRequest: ({ request, window }) =>
						new Promise((resolve) => {
							styleRequests.push({
								url: request.url,
								respond: (status) =>
									resolve(
										new window.Response('', { status, headers: { 'Content-Type': 'text/css' } }),
									),
							});
						}),
				},
			},
		},
	});
	const document = window.document as unknown as Document;
	document.body.innerHTML =
		'<main id="root"></main><script id="__octane_data" type="application/json">{"entry":"page"}</script>';
	document.getElementById('__octane_data')!.textContent = JSON.stringify({
		entry: 'page',
		clientBuild: options.clientBuild,
		streamedSignals: options.streamed
			? { buildId: options.clientBuildId, documentId: options.streamed.documentId }
			: options.documentId
				? { buildId: options.clientBuildId, documentId: options.documentId }
				: undefined,
	});
	const target = document.getElementById('root')!;
	const imports: string[] = [];
	const errors: unknown[] = [];
	const pages: string[] = [];
	const pageValues: unknown[] = [];
	const owners: (SignalOwner | undefined)[] = [];
	const owner = { scopeKey: 'octane:document' };
	let signalHydration: StreamedSignalHydration | undefined;
	const mailboxes: Record<string, unknown> = options.streamed
		? {
				__octaneStreamedSignalSelections: {
					version: 1,
					identities: [
						...options.streamed.html.matchAll(
							/v\.register\((\{.*?\})\);\}\)\(globalThis\);<\/script>/g,
						),
					].map((match) => JSON.parse(match[1])),
					register() {},
				},
				__octaneStreamedRenderer: {
					version: 1,
					frames: [
						...options.streamed.html.matchAll(
							/__octaneStreamedRenderer\.receive\((\{.*?\})\);<\/script>/g,
						),
					].map((match) => JSON.parse(match[1])),
					receive() {},
				},
			}
		: {};
	const globalRegistry: Record<string, () => Promise<unknown>> = {};
	let discovery: ((data: { buildId: string; enabled: boolean }) => void) | undefined;
	const reloads: string[] = [];
	let cleanup: (() => void) | undefined;
	let disposeLifecycle: (() => void) | undefined;
	const activateWidget = ({
		element,
		intents,
		signalOwner,
	}: IndependentHydrateActivationContext) => {
		owners.push(signalOwner);
		const button = element.querySelector('button')!;
		let clicks = intents.length;
		button.textContent = `Clicks: ${clicks}`;
		button.addEventListener('click', () => {
			button.textContent = `Clicks: ${++clicks}`;
		});
	};
	const { outputFiles } = await build({
		stdin: {
			contents: create_client_entry_source({
				clientBuildId: options.clientBuildId,
				devClientBuild: options.devCapability !== undefined,
				staticEntries: [{ id: 'page', specifier: '@fixture/page' }],
				independentEntries:
					registry === 'static' ? [{ id: 'widget', specifier: '@fixture/widget' }] : [],
				runtimeModuleId: '@fixture/runtime',
			}),
			loader: 'js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		define: { 'import.meta.hot': 'globalThis.hot' },
		plugins: [
			{
				name: 'client-entry-module-boundaries',
				setup(builder) {
					builder.onResolve(
						{ filter: /^(?:@fixture\/|octane\/hydration(?:\/streamed-signals)?$)/ },
						({ path }) => ({
							path,
							namespace: 'fixture',
						}),
					);
					builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
						contents:
							path === '@fixture/runtime'
								? `export const initializeHydrationEventCapture = globalThis.capture;
							export const hydrateRoot = globalThis.hydrate;
							export function Suspense() {} export function ErrorBoundary() {} export function createElement() {}`
								: path === 'octane/hydration'
									? `globalThis.imports.push('hydration'); export const bootstrapIndependentHydration = globalThis.bootstrap;`
									: path === 'octane/hydration/streamed-signals'
										? `globalThis.imports.push('streamed-signals'); export const bootstrapStreamedSignalHydration = globalThis.bootstrapSignals; export const installSignalDocumentLifecycle = globalThis.installLifecycle;`
										: path === '@fixture/widget'
											? `globalThis.imports.push('widget'); export default globalThis.activateWidget;`
											: "globalThis.pages.push('page'); globalThis.readPage(); export default function Page() {}",
					}));
				},
			},
		],
	});
	runInNewContext(outputFiles[0].text, {
		document,
		location: { href: window.location.href, reload: () => reloads.push('reload') },
		hot: {
			on(_event: string, callback: typeof discovery) {
				discovery = callback;
			},
			send() {
				discovery?.({ buildId: options.clientBuildId!, enabled: options.devCapability! });
			},
		},
		URL,
		console: { error: (...values: unknown[]) => errors.push(values) },
		imports,
		pages,
		activateWidget,
		installLifecycle: (options: Parameters<typeof installSignalDocumentLifecycle>[0]) => {
			const lifecycle = installSignalDocumentLifecycle(options);
			disposeLifecycle = lifecycle.dispose;
			return lifecycle;
		},
		...mailboxes,
		readPage: () => {
			if (options.streamed) pageValues.push(runWithSignalOwner(owner, options.streamed.read));
		},
		bootstrapSignals: (settings: StreamedSignalHydrationOptions) => {
			// Imported browser helpers execute in this realm, outside the entry's VM.
			vi.stubGlobal('document', document);
			signalHydration = bootstrapStreamedSignalHydration({
				...settings,
				signalOwner: owner,
				target: mailboxes,
			});
			return signalHydration;
		},
		capture: () => initializeHydrationEventCapture(document),
		hydrate: (
			_target: unknown,
			_body: unknown,
			_props: unknown,
			settings?: { signalOwner?: SignalOwner },
		) => {
			owners.push(settings?.signalOwner);
			target.setAttribute('data-ready', '');
		},
		bootstrap: (element: ParentNode, options: IndependentHydrateBootstrapOptions) => {
			cleanup = bootstrapIndependentHydration(element, options);
			return cleanup;
		},
		...(registry === 'global' || registry === 'empty-global' || registry === 'capability'
			? {
					__OCTANE_INDEPENDENT_MODULES__:
						registry === 'global'
							? {
									widget: async () => {
										imports.push('widget');
										return { default: activateWidget };
									},
								}
							: globalRegistry,
				}
			: {}),
	});
	await vi.waitFor(() => {
		if (!options.fails) expect(errors, 'generated client bootstrap errors').toEqual([]);
		expect(options.fails ? errors.length > 0 : target.hasAttribute('data-ready')).toBe(true);
	});
	return {
		target,
		imports,
		errors,
		pages,
		pageValues,
		owners,
		owner,
		styleRequests,
		reloads,
		transition(type: 'pagehide' | 'pageshow', persisted: boolean) {
			const event = new window.Event(type);
			Object.defineProperty(event, 'persisted', { value: persisted });
			window.dispatchEvent(event);
		},
		announceDev(buildId: string, enabled: boolean) {
			discovery?.({ buildId, enabled });
		},
		appendWidget(styles: string[] = [], boundaryId = 'late-widget') {
			if (registry === 'capability') {
				globalRegistry.widget = async () => {
					await options.widgetModuleReady;
					return { default: activateWidget };
				};
			}
			const widget = document.createElement('section');
			widget.setAttribute('data-octane-hydrate-id', boundaryId);
			widget.setAttribute('data-octane-hydrate-when', 'interaction');
			const button = document.createElement('button');
			button.textContent = 'Waiting';
			const sidecar = document.createElement('script');
			sidecar.type = 'application/json';
			sidecar.setAttribute('data-octane-independent', '');
			sidecar.textContent = serializeIndependentHydrateManifest(
				createIndependentHydrateManifest(
					{
						version: 1,
						boundaryId: 'widget',
						exportName: 'default',
						captureSchema: [],
						hookSeed: 0,
						idSeed: 0,
						signalSites: [],
						parentDependencies: false,
					},
					[],
					boundaryId,
					'build',
					{ moduleId: 'widget', styles },
				),
			);
			widget.append(button, sidecar);
			target.append(widget);
			return button;
		},
		async dispose() {
			for (const request of styleRequests) request.respond(500);
			disposeLifecycle?.();
			cleanup?.();
			signalHydration?.dispose();
			await window.happyDOM.close();
		},
	};
}

describe('bundler-neutral app codegen', () => {
	it('freezes a generated-entry widget load until a compatible document restore', async () => {
		let release!: () => void;
		const app = await runClientEntry('capability', {
			clientBuildId: 'build',
			documentId: 'lifecycle-document',
			widgetModuleReady: new Promise<void>((resolve) => {
				release = resolve;
			}),
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'production',
				capabilities: { independentHydration: true },
			},
		});
		try {
			const button = app.appendWidget();
			button.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			app.transition('pagehide', true);
			release();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(button.textContent).toBe('Waiting');
			app.transition('pageshow', true);
			await vi.waitFor(() => expect(button.textContent).toBe('Clicks: 1'));
			expect(app.errors).toEqual([]);
			expect(app.reloads).toEqual([]);
		} finally {
			release();
			await app.dispose();
		}
	});

	it('keeps completed-build feature-free documents free of optional lifecycle imports', async () => {
		const app = await runClientEntry('none', {
			clientBuildId: 'build',
			documentId: 'ordinary-document',
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'production',
				capabilities: { independentHydration: false },
			},
		});
		try {
			app.transition('pagehide', true);
			app.transition('pageshow', true);
			expect(app.imports).toEqual([]);
			expect(app.errors).toEqual([]);
		} finally {
			await app.dispose();
		}
	});

	it('reloads instead of activating a cached widget under changed document metadata', async () => {
		const app = await runClientEntry('capability', {
			clientBuildId: 'build',
			documentId: 'lifecycle-document',
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'production',
				capabilities: { independentHydration: true },
			},
		});
		try {
			app.transition('pagehide', true);
			app.target.ownerDocument.getElementById('__octane_data')!.textContent = '{}';
			app.transition('pageshow', true);
			expect(app.reloads).toEqual(['reload']);
		} finally {
			await app.dispose();
		}
	});
	it('fences pending island activation when a dev build changes before its module resolves', async () => {
		let release!: () => void;
		const widgetModuleReady = new Promise<void>((resolve) => {
			release = resolve;
		});
		const app = await runClientEntry('capability', {
			clientBuildId: 'build',
			devCapability: true,
			widgetModuleReady,
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'development',
				capabilities: { independentHydration: true },
			},
		});
		try {
			const button = app.appendWidget();
			button.click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			app.announceDev('next-build', true);
			release();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(app.reloads).toEqual(['reload']);
			expect(button.textContent).toBe('Waiting');
			expect(app.owners).toEqual([undefined]);
		} finally {
			release();
			await app.dispose();
		}
	});

	it.each([true, false])(
		'discovers a dev widget without losing pre-entry discovery (already discovered: %s)',
		async (devCapability) => {
			const app = await runClientEntry('capability', {
				clientBuildId: 'build',
				devCapability,
				clientBuild: {
					version: 1,
					buildId: 'build',
					mode: 'development',
					capabilities: { independentHydration: false },
				},
			});
			try {
				if (!devCapability) {
					expect(app.imports).toEqual([]);
					app.announceDev('build', true);
				}
				const button = app.appendWidget();
				button.click();
				await vi.waitFor(() => expect(button.textContent).toBe('Clicks: 1'));
				expect(app.reloads).toEqual([]);
				expect(app.errors).toEqual([]);
			} finally {
				await app.dispose();
			}
		},
	);

	it('reloads a changed dev build without adopting its new widget capability', async () => {
		const app = await runClientEntry('capability', {
			clientBuildId: 'build',
			devCapability: false,
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'development',
				capabilities: { independentHydration: false },
			},
		});
		try {
			app.announceDev('next-build', true);
			app.appendWidget().click();
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(app.reloads).toEqual(['reload']);
			expect(app.imports).toEqual([]);
			expect(app.errors).toEqual([]);
		} finally {
			await app.dispose();
		}
	});

	it('adopts an SSR query before page evaluation and shares its owner with the root and a later island', async () => {
		enableServerSignalBindings();
		const load = vi.fn(async () => 'server conversation');
		const value$ = __queryAt('g:generated-entry-query', 'generated-entry-query', () => 'a', load);
		const stream = await renderToReadableStream(
			() => {
				value$.snapshot();
				return '<p>Loading</p>';
			},
			undefined,
			{ streamedSignals: { buildId: 'build', documentId: 'generated-document' } },
		);
		const html = await new Response(stream).text();
		enableSignalBindings();
		const app = await runClientEntry('capability', {
			clientBuildId: 'build',
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'production',
				capabilities: { independentHydration: true },
			},
			streamed: { html, documentId: 'generated-document', read: () => value$.get() },
		});
		try {
			expect(app.pageValues).toEqual(['server conversation']);
			expect(load).toHaveBeenCalledTimes(1);
			const button = app.appendWidget();
			button.click();
			await vi.waitFor(() => expect(button.textContent).toBe('Clicks: 1'));
			expect(app.owners).toEqual([app.owner, app.owner]);
			expect(app.owners.every((entry) => entry === app.owner)).toBe(true);
			expect(app.errors).toEqual([]);
		} finally {
			await app.dispose();
		}
	});

	it.each(['different', undefined])(
		'rejects %s executable build identity before evaluating a route',
		async (clientBuildId) => {
			const app = await runClientEntry('none', {
				clientBuildId,
				clientBuild: {
					version: 1,
					buildId: 'build',
					mode: 'production',
					capabilities: { independentHydration: false },
				},
				fails: true,
			});
			try {
				expect(app.pages).toEqual([]);
				expect(app.target.hasAttribute('data-ready')).toBe(false);
				expect(String(app.errors)).toContain('build');
			} finally {
				await app.dispose();
			}
		},
	);

	it('hydrates matching build data without evaluating unused hydration features', async () => {
		const app = await runClientEntry('none', {
			clientBuildId: 'build',
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'production',
				capabilities: { independentHydration: false },
			},
		});
		try {
			expect(app.pages).toEqual(['page']);
			expect(app.imports).toEqual([]);
			expect(app.errors).toEqual([]);
		} finally {
			await app.dispose();
		}
	});

	it('accepts a later first widget when completed build metadata declares the capability', async () => {
		const app = await runClientEntry('capability', {
			clientBuildId: 'build',
			clientBuild: {
				version: 1,
				buildId: 'build',
				mode: 'production',
				capabilities: { independentHydration: true },
			},
		});
		try {
			const button = app.appendWidget();
			button.click();
			await vi.waitFor(() => expect(button.textContent).toBe('Clicks: 1'));
			expect(app.errors).toEqual([]);
		} finally {
			await app.dispose();
		}
	});

	it.each(['static', 'global'] as const)(
		'activates later widgets using the %s entry registry when initial HTML has none',
		async (registry) => {
			const app = await runClientEntry(registry);
			try {
				const button = app.appendWidget(['/widget.css']);
				button.click();
				await vi.waitFor(() =>
					expect(app.styleRequests[0]?.url).toBe('https://example.test/widget.css'),
				);
				expect(button.textContent).toBe('Waiting');
				expect(app.imports).not.toContain('widget');
				app.styleRequests[0].respond(500);
				await vi.waitFor(() =>
					expect(String(app.errors)).toContain('Failed to load independent Hydrate stylesheet'),
				);
				expect(button.textContent).toBe('Waiting');
				expect(app.imports).not.toContain('widget');
				app.errors.length = 0;
				button.click();
				await vi.waitFor(() =>
					expect(app.styleRequests[1]?.url).toBe('https://example.test/widget.css'),
				);
				expect(button.textContent).toBe('Waiting');
				expect(app.imports).not.toContain('widget');
				app.styleRequests[1].respond(200);
				await vi.waitFor(() => expect(button.textContent).toBe('Clicks: 2'));
				button.click();
				expect(button.textContent).toBe('Clicks: 3');
				const nextButton = app.appendWidget(['/widget.css'], 'next-widget');
				nextButton.click();
				await vi.waitFor(() => expect(nextButton.textContent).toBe('Clicks: 1'));
				expect(app.errors).toEqual([]);
			} finally {
				await app.dispose();
			}
		},
	);

	it.each(['none', 'empty-global'] as const)(
		'does not evaluate optional hydration code without independent entries (%s)',
		async (registry) => {
			const app = await runClientEntry(registry);
			try {
				expect(app.target.hasAttribute('data-ready')).toBe(true);
				expect(app.imports).toEqual([]);
				expect(app.errors).toEqual([]);
			} finally {
				await app.dispose();
			}
		},
	);

	it('keeps stable hydration IDs separate from emitted import specifiers', async () => {
		const source = create_client_entry_source({
			staticEntries: [
				{ id: '/src/Page.tsrx', specifier: '/workspace/src/Page.tsrx' },
				'/src/Layout.tsrx',
			],
			independentEntries: [
				{
					id: 'w:weather',
					specifier: '/workspace/src/Page.tsrx?octane-hydrate=0',
				},
			],
			resolveImport: (id) => `/workspace${id}`,
			runtimeModuleId: '@renderer/client',
			generatedBy: '@test/integration',
		});

		expect(source).toContain('"/src/Page.tsrx": () => import("/workspace/src/Page.tsrx")');
		expect(source).toContain('"/src/Layout.tsrx": () => import("/workspace/src/Layout.tsrx")');
		expect(source).toContain('from "@renderer/client"');
		expect(source).toContain(
			'"w:weather": () => import("/workspace/src/Page.tsrx?octane-hydrate=0")',
		);
		expect(source).toContain('const loader = independentModules[moduleId]');
		expect(source).toContain('Auto-generated by @test/integration');
		const initializeIndex = source.indexOf('initializeHydrationEventCapture();');
		expect(initializeIndex).toBeGreaterThan(-1);
		expect(initializeIndex).toBeLessThan(source.indexOf('(async () =>'));
		expect(source).toContain("import('octane/hydration')");
		expect(source.indexOf('await bootstrapIndependentIslands(target)')).toBeLessThan(
			source.indexOf('const pageMod = await importModule(data.entry)'),
		);
		await expect(transform(source, { loader: 'js' })).resolves.toBeDefined();
	});

	it('emits a template-free server manifest with mapped imports', async () => {
		const source = generateServerManifestEntry({
			routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })],
			octaneConfigPath: '/workspace/octane.config.ts',
			moduleImports: {
				'/src/Page.tsrx': '/workspace/src/Page.tsrx',
			},
			configImportPath: '/workspace/octane.config.ts',
			serverRuntimeModuleId: '@renderer/server',
			staticRuntimeModuleId: '@renderer/static',
		});

		expect(source).toContain('from "/workspace/src/Page.tsrx"');
		expect(source).toContain('"/src/Page.tsrx": _page_0');
		expect(source).toContain('export const manifest =');
		expect(source).toContain('export const rendererDeps =');
		expect(source).not.toContain("readFileSync(join(__dirname, './index.html')");
		expect(source).not.toContain('isMainModule');
		await expect(transform(source, { loader: 'js' })).resolves.toBeDefined();
	});

	it('emits a platform-neutral Web Worker handler factory', async () => {
		const source = generateServerEntry({
			routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })],
			octaneConfigPath: '/workspace/octane.config.ts',
			moduleImports: {
				'/src/Page.tsrx': '/workspace/src/Page.tsrx',
			},
			configImportPath: '/workspace/octane.config.ts',
			mode: 'webworker',
			clientAssetMap: {
				'/src/Page.tsrx': { js: 'assets/page.js', css: ['assets/page.css'] },
			},
		});

		expect(source).toContain('export const manifest =');
		expect(source).toContain('export const rendererDeps =');
		expect(source).toContain('export function createWebWorkerHandler');
		expect(source).toContain('clientAssets = manifest.clientAssets');
		expect(source).toContain('independentHydration = manifest.independentHydration');
		expect(source).toContain("adapter.serverTarget 'webworker' requires adapter.runtime");
		expect(source).not.toMatch(/from ['"]node:/);
		expect(source).not.toContain('nodeHandler');
		await expect(transform(source, { loader: 'js' })).resolves.toBeDefined();
	});

	it('stubs the Cloudflare deploy adapter in browser bundles', () => {
		expect(SERVER_ONLY_ADAPTER_IDS).toContain('@octanejs/adapter-cloudflare');
		expect(create_adapter_browser_stub_source()).toContain('export function cloudflare()');
	});

	it('can load a late client asset map beside the production server entry', () => {
		const source = generateServerEntry({
			routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })],
			octaneConfigPath: '/workspace/octane.config.ts',
			clientAssetMapFile: 'client-assets.json',
		});
		expect(source).toContain(
			'JSON.parse(readFileSync(join(__dirname, "client-assets.json"), \'utf-8\'))',
		);
	});

	it('rejects an empty required client build file instead of falling back to a legacy manifest', async () => {
		const source = generateServerManifestEntry({
			routes: [],
			octaneConfigPath: '/app/config.js',
			clientBuildFile: 'octane-client-build.json',
		});
		const { code } = await transform(source, {
			format: 'cjs',
			define: { 'import.meta.url': JSON.stringify('file:///build/server/entry.js') },
		});
		const clientBuild = {
			version: 1,
			buildId: 'completed-client-build',
			mode: 'production',
			capabilities: { independentHydration: false },
		};
		const require = createRequire(import.meta.url);
		const execute = (metadata: unknown) => {
			const module = { exports: {} as { manifest?: { clientBuild: unknown } } };
			runInNewContext(code, {
				module,
				require(id: string) {
					if (id === 'node:fs')
						return {
							readFileSync(path: string) {
								expect(path).toBe('/build/server/octane-client-build.json');
								return JSON.stringify(metadata);
							},
						};
					if (id.startsWith('node:')) return require(id);
					if (id === '/app/config.js') return { router: { routes: [] }, server: {} };
					if (id === '@octanejs/app-core/config')
						return { resolveOctaneConfig: (value: unknown) => value };
					return {};
				},
			});
			return module.exports.manifest?.clientBuild;
		};
		expect(() => execute(null)).toThrow('Completed client build metadata is required');
		expect(execute(clientBuild)).toEqual(clientBuild);
	});

	it('loads an optional independent Hydrate manifest beside a production server entry', () => {
		const source = generateServerEntry({
			routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })],
			octaneConfigPath: '/workspace/octane.config.ts',
			independentHydrationManifestFile: 'octane-independent-hydration.json',
		});
		expect(source).toContain(
			'readFileSync(join(__dirname, "octane-independent-hydration.json"), \'utf-8\')',
		);
		expect(source).toContain("error.code === 'ENOENT'");
		expect(source).toContain('independentHydration,');
	});

	it('normalizes in-root files to stable project module IDs', () => {
		expect(normalize_module_reference('/workspace/src/Page.tsrx', '/workspace')).toBe(
			'/src/Page.tsrx',
		);
		expect(normalize_module_reference('/shared/Page.tsrx', '/workspace')).toBe('/shared/Page.tsrx');
	});
});
