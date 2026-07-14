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
