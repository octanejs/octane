import {
	existsSync,
	lstatSync,
	mkdtempSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRsbuild } from '@rsbuild/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pluginOctane } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

function link(root: string, packageName: string, target: string) {
	const destination = join(root, 'node_modules', ...packageName.split('/'));
	mkdirSync(dirname(destination), { recursive: true });
	if (existsSync(destination) || lstatMaybe(destination)) rmSync(destination, { recursive: true });
	symlinkSync(target, destination, 'dir');
}

function lstatMaybe(file: string) {
	try {
		return lstatSync(file);
	} catch {
		return null;
	}
}

function listFiles(root: string, current = root): string[] {
	if (!existsSync(current)) return [];
	return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
		const file = join(current, entry.name);
		return entry.isDirectory() ? listFiles(root, file) : [file.slice(root.length + 1)];
	});
}

function readJavaScript(root: string) {
	return listFiles(root)
		.filter((file) => /\.m?js$/.test(file))
		.map((file) => readFileSync(join(root, file), 'utf8'))
		.join('\n');
}

async function build(root: string, rsbuildConfig: Record<string, unknown>) {
	const instance = await createRsbuild({ cwd: root, rsbuildConfig: rsbuildConfig as any });
	await instance.build();
}

function writeRoutedApp(root: string, render: 'buffered' | 'streaming' = 'buffered') {
	write(root, 'public/favicon.svg', '<svg data-rsbuild-public="ready"></svg>\n');
	write(
		root,
		'index.html',
		`<!doctype html>
<html>
	<head><!--ssr-head--></head>
	<body><div id="root"><!--ssr-body--></div></body>
</html>
`,
	);
	write(
		root,
		'src/Page.tsrx',
		`import { vendorLabel } from './vendor.js';
import './page.css';

export function Page() @{
	<main class="route vendor" data-rsbuild-ssr="ready">Rsbuild route{vendorLabel as string}</main>
}
`,
	);
	write(root, 'src/page.css', '.route { color: rebeccapurple; }\n');
	write(
		root,
		'src/vendor.js',
		`import './vendor.css';

export const vendorLabel = ' with split assets';
`,
	);
	write(root, 'src/vendor.css', '.vendor { font-weight: 600; }\n');
	write(
		root,
		'src/actions.tsrx',
		`module server {
	export async function projectRpc(value: string) {
		return 'project-rpc:' + value;
	}
}
`,
	);
	write(
		root,
		'octane.config.ts',
		`import { compose, defineConfig, is_rpc_request, RenderRoute, ServerRoute } from '@octanejs/rsbuild-plugin';

export default defineConfig({
	build: { outDir: 'build', minify: false },
	router: {
		routes: [
			new RenderRoute({ path: '/', entry: '/src/Page.tsrx' }),
			new ServerRoute({
				path: '/api/health',
				handler: (context) => compose([])(context, () => Response.json({
					ok: true,
					integration: 'rsbuild',
					rpc: is_rpc_request(context.url.pathname),
				})),
			}),
		],
	},
	server: { render: ${JSON.stringify(render)} },
});
`,
	);
}

function writeClientOnlyRendererApp(root: string) {
	write(
		root,
		'index.html',
		`<!doctype html>
<html>
	<head><!--ssr-head--></head>
	<body><div id="root"><!--ssr-body--></div></body>
</html>
`,
	);
	write(root, 'src/object-renderer.ts', `export * from 'octane/universal';\n`);
	write(
		root,
		'src/scene-setup.ts',
		`const state = globalThis as typeof globalThis & {
	__rsbuildAuthoredSceneSetup?: number;
};

state.__rsbuildAuthoredSceneSetup = (state.__rsbuildAuthoredSceneSetup ?? 0) + 1;
`,
	);
	write(
		root,
		'src/Scene.object.tsrx',
		`import './scene-setup.ts';

export const sceneMetadata = 'authored-rsbuild-client-scene';

export function Scene() @{
	<scene label="rsbuild-client-only">
		<mesh kind="proof" />
	</scene>
}
`,
	);
	write(
		root,
		'src/ObjectCanvas.tsrx',
		`import { useLayoutEffect, useState } from 'octane';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalHostBoundary,
	createUniversalRoot,
} from 'octane/universal';

const ObjectBoundary = createUniversalHostBoundary('object');

interface FixtureState {
	__rsbuildObjectContainer?: ReturnType<typeof createObjectContainer>;
	__rsbuildObjectRegionCount?: number;
	__rsbuildObjectRootCount?: number;
}

export function Canvas(props: { children?: unknown }) @{
	const [root, setRoot] = useState<ReturnType<typeof createUniversalRoot> | null>(null);

	useLayoutEffect(() => {
		const fixture = globalThis as typeof globalThis & FixtureState;
		const container = createObjectContainer();
		const nextRoot = createUniversalRoot(container, createObjectDriver());
		fixture.__rsbuildObjectContainer = container;
		fixture.__rsbuildObjectRegionCount = (fixture.__rsbuildObjectRegionCount ?? 0) + 1;
		fixture.__rsbuildObjectRootCount = (fixture.__rsbuildObjectRootCount ?? 0) + 1;
		setRoot(nextRoot);
		return () => nextRoot.unmount();
	}, []);

	<section
		class="object-canvas-shell"
		data-object-canvas-shell=""
		data-object-region={root === null ? 'pending' : 'ready'}
	>
		<canvas aria-label="generic renderer canvas" />
		@if (root !== null && props.children !== undefined) {
			<ObjectBoundary root={root} children={props.children} />
		}
	</section>
}
`,
	);
	write(
		root,
		'src/pre-hydrate.ts',
		`interface FixtureHydrationState {
	__rsbuildSsrCanvasShell?: Element | null;
}

export default function preHydrate() {
	const fixture = globalThis as typeof globalThis & FixtureHydrationState;
	fixture.__rsbuildSsrCanvasShell = document.querySelector('[data-object-canvas-shell]');
}
`,
	);
	write(
		root,
		'src/Page.tsrx',
		`import { Canvas } from '@fixture/object-canvas';
import { Scene } from './Scene.object.tsrx';

export function Page() @{
	<main data-rsbuild-client-only="ready">
		<h1>Rsbuild client-only renderer</h1>
		<Canvas>
			<Scene />
		</Canvas>
	</main>
}
`,
	);
	write(
		root,
		'octane.config.ts',
		`import { defineConfig, RenderRoute } from '@octanejs/rsbuild-plugin';

export default defineConfig({
	build: { outDir: 'build', minify: false },
	compiler: {
		renderers: {
			registry: {
				object: {
					module: '/src/object-renderer.ts',
					server: 'client-only',
					text: 'host',
				},
			},
			rules: [{ include: 'src/**/*.object.tsrx', renderer: 'object' }],
			boundaries: {
				'@fixture/object-canvas': {
					Canvas: {
						ownerRenderer: 'dom',
						childRenderer: 'object',
						prop: 'children',
						server: 'omit-child',
					},
				},
			},
		},
	},
	router: {
		preHydrate: '/src/pre-hydrate.ts',
		routes: [new RenderRoute({ path: '/', entry: '/src/Page.tsrx' })],
	},
	server: { render: 'buffered' },
});
`,
	);
}

function clientOnlyRendererConfig(root: string, hmr: boolean) {
	return {
		plugins: [pluginOctane({ hmr })],
		resolve: {
			alias: {
				'@fixture/object-canvas': join(root, 'src/ObjectCanvas.tsrx'),
			},
		},
	};
}

describe('programmatic Rsbuild 2 integration', () => {
	let root: string;
	let linkedRoot: string;
	let linkedAction: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-build-'));
		linkedRoot = mkdtempSync(join(tmpdir(), 'octane-rsbuild-linked-'));
		write(
			linkedRoot,
			'package.json',
			JSON.stringify({
				name: '@fixture/octane-actions',
				private: true,
				type: 'module',
				exports: './src/index.tsx',
				peerDependencies: { octane: '*' },
			}) + '\n',
		);
		linkedAction = write(
			linkedRoot,
			'src/index.tsx',
			`module server {
	export async function linkedRpc(value: string) {
		return 'linked-rpc:' + value;
	}
}
`,
		);
		write(
			root,
			'package.json',
			JSON.stringify({
				name: 'octane-rsbuild-fixture',
				private: true,
				type: 'module',
				dependencies: { '@fixture/octane-actions': 'workspace:*' },
			}) + '\n',
		);
		write(
			root,
			'tsconfig.json',
			JSON.stringify({ compilerOptions: { allowJs: true, moduleResolution: 'Bundler' } }) + '\n',
		);
		link(root, 'octane', join(repositoryRoot, 'packages/octane'));
		link(root, '@octanejs/rsbuild-plugin', join(repositoryRoot, 'packages/rsbuild-plugin-octane'));
		link(root, '@fixture/octane-actions', linkedRoot);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
		rmSync(linkedRoot, { recursive: true, force: true });
	});

	it('preserves user entries and compiles TSRX without an Octane app config', async () => {
		write(
			root,
			'src/App.tsrx',
			`import { useState } from 'octane';

export function App() @{
	const [value] = useState('compiler-only');
	<main data-rsbuild-compiler-only>{value as string}</main>
}
`,
		);
		write(root, 'src/index.js', `export { App } from './App.tsrx';\n`);

		await build(root, {
			plugins: [pluginOctane({ hmr: false })],
			source: { entry: { custom: './src/index.js' } },
			output: {
				distPath: { root: 'dist-compiler' },
				minify: false,
				sourceMap: { js: 'source-map' },
			},
		});

		const outputRoot = join(root, 'dist-compiler');
		const files = listFiles(outputRoot);
		expect(files.some((file) => /custom(?:\.[^.]+)?\.js$/.test(file))).toBe(true);
		expect(files.some((file) => file.endsWith('.js.map'))).toBe(true);
		expect(readJavaScript(outputRoot)).toContain('data-rsbuild-compiler-only');
		expect(files).not.toContain('server/entry.js');
	}, 60_000);

	it('builds routed client/server environments and serves the production SSR handler', async () => {
		writeRoutedApp(root);

		await build(root, {
			plugins: [pluginOctane({ hmr: false })],
			tools: {
				rspack(config: any, context: { environment: { name: string } }) {
					if (context.environment.name !== 'web') return;
					config.optimization ??= {};
					config.optimization.splitChunks = {
						chunks: 'async',
						minSize: 0,
						cacheGroups: {
							default: false,
							defaultVendors: false,
							octaneTestVendor: {
								test: /[\\/]vendor\.(?:css|js)$/,
								name: '0-vendor',
								chunks: 'async',
								enforce: true,
							},
						},
					};
				},
			},
		});

		const clientRoot = join(root, 'build/client');
		const serverRoot = join(root, 'build/server');
		expect(existsSync(join(clientRoot, 'index.html'))).toBe(false);
		expect(existsSync(join(serverRoot, 'entry.js'))).toBe(true);
		expect(existsSync(join(serverRoot, 'index.html'))).toBe(true);
		expect(existsSync(join(serverRoot, 'octane-client-assets.json'))).toBe(true);

		const html = readFileSync(join(serverRoot, 'index.html'), 'utf8');
		expect(html).toContain('data-octane-hydrate');
		expect(html).toContain('<!--ssr-head-->');
		expect(html).toContain('<!--ssr-body-->');

		const assetMap = JSON.parse(
			readFileSync(join(serverRoot, 'octane-client-assets.json'), 'utf8'),
		);
		expect(assetMap['/src/Page.tsrx']).toEqual({
			js: expect.stringMatching(/\.js$/),
			css: [expect.stringMatching(/\.css$/), expect.stringMatching(/\.css$/)],
		});
		expect(assetMap['/src/Page.tsrx'].js).not.toContain('0-vendor');
		expect(assetMap['/src/Page.tsrx'].css.some((file: string) => file.includes('0-vendor'))).toBe(
			true,
		);
		expect(existsSync(join(clientRoot, assetMap['/src/Page.tsrx'].js))).toBe(true);
		for (const cssFile of assetMap['/src/Page.tsrx'].css) {
			expect(existsSync(join(clientRoot, cssFile))).toBe(true);
		}

		const entry = pathToFileURL(join(serverRoot, 'entry.js'));
		entry.searchParams.set('test', String(Date.now()));
		const server = (await import(entry.href)) as {
			handler: (request: Request) => Promise<Response>;
		};
		expect(Object.keys(server)).toContain('handler');
		expect(server.handler).toBeTypeOf('function');
		const response = await server.handler(new Request('http://example.test/'));
		const body = await response.text();
		expect(response.status).toBe(200);
		expect(body).toContain('data-rsbuild-ssr="ready"');
		expect(body).toContain('Rsbuild route');
		for (const cssFile of assetMap['/src/Page.tsrx'].css) expect(body).toContain(cssFile);
		expect(body).toContain(`<link rel="modulepreload" href="/${assetMap['/src/Page.tsrx'].js}">`);
		expect(body).toContain('id="__octane_data"');
		expect(body).not.toContain('<!--ssr-body-->');

		for (const [id, exportName, value, expected] of [
			['/src/actions.tsrx', 'projectRpc', 'project', 'project-rpc:project'],
			[
				realpathSync(linkedAction).replaceAll('\\', '/'),
				'linkedRpc',
				'linked',
				'linked-rpc:linked',
			],
		]) {
			const hash = createHash('sha256').update(`${id}#${exportName}`).digest('hex').slice(0, 8);
			const rpcResponse = await server.handler(
				new Request(`http://example.test/_$_ripple_rpc_$_/${hash}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					// devalue.stringify([value])
					body: `[[1],${JSON.stringify(value)}]`,
				}),
			);
			expect(rpcResponse.status, id).toBe(200);
			const encoded = JSON.parse(await rpcResponse.text());
			expect(encoded[encoded[0].value]).toBe(expected);
		}
	}, 120_000);

	it('emits stable client-only chunks and hydrates one adopted generic region', async () => {
		writeClientOnlyRendererApp(root);
		await build(root, clientOnlyRendererConfig(root, false));

		const clientRoot = join(root, 'build/client');
		const serverRoot = join(root, 'build/server');
		const clientReferenceId = 'octane-client-reference-v1:object:/src/Scene.object.tsrx';
		const clientReferenceManifest = JSON.parse(
			readFileSync(join(clientRoot, 'octane-client-references.json'), 'utf8'),
		);
		const reference = clientReferenceManifest.references[clientReferenceId];
		expect(clientReferenceManifest.version).toBe(1);
		expect(reference).toEqual({
			moduleId: '/src/Scene.object.tsrx',
			renderer: 'object',
			chunks: [...reference.chunks].sort(),
		});
		expect(reference.chunks.length).toBeGreaterThan(0);
		for (const chunk of reference.chunks) {
			expect(existsSync(join(clientRoot, chunk))).toBe(true);
		}

		const serverCode = readJavaScript(serverRoot);
		expect(serverCode).not.toContain('__rsbuildAuthoredSceneSetup');
		expect(serverCode).not.toContain('authored-rsbuild-client-scene');
		delete (globalThis as any).__rsbuildAuthoredSceneSetup;
		const entry = pathToFileURL(join(serverRoot, 'entry.js'));
		entry.searchParams.set('client-only-test', String(Date.now()));
		const server = (await import(entry.href)) as {
			handler: (request: Request) => Promise<Response>;
		};
		const response = await server.handler(new Request('http://example.test/'));
		const serverHtml = await response.text();
		expect(response.status).toBe(200);
		expect(serverHtml).toContain('data-rsbuild-client-only="ready"');
		expect(serverHtml).toContain('data-object-canvas-shell=""');
		expect(serverHtml).toContain('data-object-region="pending"');
		expect((globalThis as any).__rsbuildAuthoredSceneSetup).toBeUndefined();

		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				// This milestone proves renderer hydration/adoption against a real dev server.
				// Rspack HMR execution is covered by Milestone 8, so keep this
				// browser proof on the same production-compatible compile path as the build.
				...clientOnlyRendererConfig(root, false),
				dev: { lazyCompilation: false },
				mode: 'development',
				server: { host: '127.0.0.1' },
			},
		});
		const started = await instance.startDevServer({ getPortSilently: true });
		const origin = `http://127.0.0.1:${started.port}`;
		let browser: import('playwright').Browser | undefined;
		try {
			const { chromium } = await import('playwright');
			browser = await chromium.launch({ headless: true });
		} catch (error) {
			await started.server.close();
			throw new Error(
				'[rsbuild-plugin client-only renderer] Chromium is required ' +
					'(run `pnpm exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}

		const page = await browser.newPage();
		const errors: string[] = [];
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		page.on('pageerror', (error) => errors.push('pageerror: ' + String(error)));
		try {
			await page.goto(origin + '/', { waitUntil: 'load' });
			try {
				await page.locator('[data-object-region="ready"]').waitFor({ timeout: 30_000 });
			} catch (error) {
				const browserState = await page.evaluate(() => {
					const fixture = globalThis as typeof globalThis & {
						__rsbuildAuthoredSceneSetup?: number;
						__rsbuildObjectRegionCount?: number;
						__rsbuildObjectRootCount?: number;
						__rsbuildSsrCanvasShell?: Element | null;
					};
					return {
						authoredSceneSetup: fixture.__rsbuildAuthoredSceneSetup,
						capturedServerShell: !!fixture.__rsbuildSsrCanvasShell,
						readyState: document.readyState,
						regionCount: fixture.__rsbuildObjectRegionCount,
						rootCount: fixture.__rsbuildObjectRootCount,
					};
				});
				throw new Error(
					`Rsbuild Canvas did not become ready. State: ${JSON.stringify(browserState)}. Browser errors: ${JSON.stringify(errors)}. HTML: ${await page.content()}`,
					{ cause: error },
				);
			}
			await page.evaluate(
				() =>
					new Promise<void>((resolveFrame) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())),
					),
			);
			const proof = await page.evaluate(() => {
				const fixture = globalThis as typeof globalThis & {
					__rsbuildAuthoredSceneSetup?: number;
					__rsbuildObjectContainer?: {
						children: Array<{ type: string; children: Array<{ type: string }> }>;
						commits: unknown[];
					};
					__rsbuildObjectRegionCount?: number;
					__rsbuildObjectRootCount?: number;
					__rsbuildSsrCanvasShell?: Element | null;
				};
				const shell = document.querySelector('[data-object-canvas-shell]');
				return {
					adoptedServerShell: fixture.__rsbuildSsrCanvasShell === shell,
					authoredSceneSetup: fixture.__rsbuildAuthoredSceneSetup,
					commits: fixture.__rsbuildObjectContainer?.commits.length,
					regionCount: fixture.__rsbuildObjectRegionCount,
					rootCount: fixture.__rsbuildObjectRootCount,
					scene: fixture.__rsbuildObjectContainer?.children.map((child) => ({
						type: child.type,
						children: child.children.map((nested) => nested.type),
					})),
					shellCount: document.querySelectorAll('[data-object-canvas-shell]').length,
				};
			});
			expect(proof).toEqual({
				adoptedServerShell: true,
				authoredSceneSetup: 1,
				commits: 1,
				regionCount: 1,
				rootCount: 1,
				scene: [{ type: 'scene', children: ['mesh'] }],
				shellCount: 1,
			});
			expect(errors).toEqual([]);
		} finally {
			await page.close();
			await browser.close();
			await started.server.close();
		}
	}, 180_000);

	it('streams routed HTML and server routes through the Rsbuild Environment API in dev', async () => {
		writeRoutedApp(root, 'streaming');
		const instance = await createRsbuild({
			cwd: root,
			rsbuildConfig: {
				plugins: [pluginOctane()],
				server: { host: '127.0.0.1' },
			},
		});
		const started = await instance.startDevServer({ getPortSilently: true });
		const origin = `http://127.0.0.1:${started.port}`;

		try {
			const response = await fetch(`${origin}/`);
			const body = await response.text();
			expect(response.status).toBe(200);
			expect(response.headers.get('content-type')).toContain('text/html');
			expect(body).toContain('data-rsbuild-ssr="ready"');
			expect(body).toContain('data-octane-hydrate');
			expect(body).toContain('id="__octane_data"');

			const script = body.match(/<script[^>]+data-octane-hydrate[^>]+src="([^"]+)"/i)?.[1];
			expect(script).toBeTruthy();
			const assetResponse = await fetch(new URL(script!, origin));
			expect(assetResponse.status).toBe(200);
			expect(assetResponse.headers.get('content-type')).toMatch(/javascript/);

			const publicResponse = await fetch(`${origin}/favicon.svg`);
			expect(publicResponse.status).toBe(200);
			expect(await publicResponse.text()).toContain('data-rsbuild-public="ready"');

			const apiResponse = await fetch(`${origin}/api/health`);
			expect(apiResponse.status).toBe(200);
			expect(await apiResponse.json()).toEqual({
				ok: true,
				integration: 'rsbuild',
				rpc: false,
			});

			write(
				root,
				'src/Page.tsrx',
				`import './page.css';

export function Page() @{
	<main class="route" data-rsbuild-ssr="updated">Updated Rsbuild route</main>
}
`,
			);
			let updatedBody = '';
			const deadline = Date.now() + 20_000;
			while (Date.now() < deadline) {
				await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
				updatedBody = await (await fetch(`${origin}/`)).text();
				if (updatedBody.includes('Updated Rsbuild route')) break;
			}
			expect(updatedBody).toContain('data-rsbuild-ssr="updated"');
			expect(updatedBody).toContain('Updated Rsbuild route');
		} finally {
			await started.server.close();
		}
	}, 120_000);
});
