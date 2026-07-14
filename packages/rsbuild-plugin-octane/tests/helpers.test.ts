import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderRoute, ServerRoute } from '@octanejs/app-core';
import * as appCore from '@octanejs/app-core';
import { resolveOctaneConfig } from '@octanejs/app-core/config';
import * as rsbuildPlugin from '../src/index.js';
import { finalizeOctaneRsbuildOutput } from '../src/build.js';
import { isRsbuildOwnedUrl, markHydrationEntry } from '../src/html.js';
import {
	collectClientEntries,
	discoverServerModules,
	resolveProjectModule,
	toProjectModuleId,
} from '../src/project.js';

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

it('re-exports the complete app-core runtime surface promised by its types', () => {
	for (const exportName of Object.keys(appCore)) {
		expect(rsbuildPlugin).toHaveProperty(exportName, appCore[exportName as keyof typeof appCore]);
	}
});

describe('Rsbuild HTML integration', () => {
	const template = `<!doctype html>
<html>
	<head><!--ssr-head--></head>
	<body><div id="root"><!--ssr-body--></div></body>
</html>`;

	it('marks exactly the concrete generated hydration entry', () => {
		const html = template.replace(
			'</body>',
			'<script src="/static/js/vendor.js"></script><script type="module" src="/static/js/octane.123.js?x=1"></script></body>',
		);
		const marked = markHydrationEntry(html, ['static/js/octane.123.js']);

		expect(marked).toContain(
			'<script data-octane-hydrate type="module" src="/static/js/octane.123.js?x=1">',
		);
		expect(marked).not.toContain('<script data-octane-hydrate src="/static/js/vendor.js">');
		expect(markHydrationEntry(marked, ['static/js/octane.123.js'])).toBe(marked);
	});

	it('rejects missing, ambiguous, and invalid SSR templates', () => {
		expect(() => markHydrationEntry(template, ['missing.js'])).toThrow(
			'Expected one generated hydration entry script; found 0',
		);
		const duplicate = template.replace(
			'</body>',
			'<script src="/entry.js"></script><script src="/entry.js"></script></body>',
		);
		expect(() => markHydrationEntry(duplicate, ['entry.js'])).toThrow(
			'Expected one generated hydration entry script; found 2',
		);
		expect(() =>
			markHydrationEntry('<div id="root"></div><script src="/entry.js"></script>', ['entry.js']),
		).toThrow('<!--ssr-head-->');
	});

	it('leaves application routes to Octane but reserves dev-server, emitted, and public URLs', () => {
		const assets = new Set(['static/js/app.js', '/favicon.svg']);
		for (const pathname of [
			'/__rsbuild__/client',
			'/@id/runtime',
			'/rsbuild-dev-server/socket',
			'/node_modules/.cache/file.js',
			'/static/js/app.js',
			'/favicon.svg',
		]) {
			expect(isRsbuildOwnedUrl(new URL(`http://example.test${pathname}`), assets)).toBe(true);
		}
		expect(isRsbuildOwnedUrl(new URL('http://example.test/products/42'), assets)).toBe(false);

		const publicRoot = mkdtempSync(join(tmpdir(), 'octane-rsbuild-public-'));
		try {
			write(publicRoot, 'robots.txt', 'User-agent: *\n');
			expect(
				isRsbuildOwnedUrl(new URL('http://example.test/robots.txt?cache=1'), new Set(), [
					publicRoot,
				]),
			).toBe(true);
			expect(
				isRsbuildOwnedUrl(new URL('http://example.test/missing.txt'), new Set(), [publicRoot]),
			).toBe(false);
			expect(
				isRsbuildOwnedUrl(new URL('http://example.test/..%2Fsecret.txt'), new Set(), [publicRoot]),
			).toBe(false);
		} finally {
			rmSync(publicRoot, { recursive: true, force: true });
		}
	});
});

describe('Rsbuild project module discovery', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-project-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('separates stable project IDs from concrete filesystem imports', () => {
		const page = write(root, 'src/Page.tsrx', 'export function Page() @{ <p>page</p> }\n');
		expect(resolveProjectModule('/src/Page.tsrx', root)).toBe(page);
		expect(resolveProjectModule('./src/Page.tsrx', root)).toBe(page);
		expect(toProjectModuleId(page, root)).toBe('/src/Page.tsrx');

		const external = resolve(root, '..', 'shared', 'Page.tsrx');
		expect(toProjectModuleId(external, root)).toBe(external.replaceAll('\\', '/'));
	});

	it('collects every serializable client module once', () => {
		const config = resolveOctaneConfig({
			router: {
				preHydrate: '/src/pre-hydrate.ts',
				routes: [
					new RenderRoute({
						path: '/',
						entry: ['Home', '/src/Page.tsrx'],
						layout: '/src/Layout.tsrx',
					}),
					new RenderRoute({ path: '/again', entry: '/src/Page.tsrx' }),
					new ServerRoute({ path: '/api', handler: () => new Response('ok') }),
				],
			},
			rootBoundary: {
				pending: '/src/Pending.tsrx',
				catch: ['Catch', '/src/Catch.tsrx'],
			},
		});

		expect(collectClientEntries(config)).toEqual([
			'/src/Page.tsrx',
			'/src/Layout.tsrx',
			'/src/pre-hydrate.ts',
			'/src/Pending.tsrx',
			'/src/Catch.tsrx',
		]);
	});

	it('discovers module-server owners while ignoring build and dependency trees', () => {
		const first = write(
			root,
			'src/actions.tsrx',
			'module server { export async function save() { return 1; } }\n',
		);
		const second = write(
			root,
			'src/nested/action.tsx',
			'\n  module /* compiler-validated */ server { export async function remove() { return 1; } }\n',
		);
		write(
			root,
			'src/plain.tsx',
			`/*
module server { export function commentedOut() {} }
*/
export const quoted = "module server {";
export const templated = \`
module server { export function alsoNotCode() {} }
\`;
export const markerTemplate = \`
export const _$_server_$_ = (() => {
\`;
export const pattern = /module server {/;
export function Example() { return <pre>{"module server {"}</pre>; }
`,
		);
		write(root, 'dist/generated.tsrx', 'module server { export function nope() {} }\n');
		write(root, 'tests/fixture.tsrx', 'module server { export function nope() {} }\n');
		write(root, 'examples/demo.tsrx', 'module server { export function nope() {} }\n');
		write(root, 'node_modules/pkg/index.tsrx', 'module server { export function nope() {} }\n');

		const discovery = discoverServerModules(root, [root, join(root, 'src')]);
		expect(discovery.files).toEqual([first, second].sort());
		expect(discovery.ids).toEqual(['/src/actions.tsrx', '/src/nested/action.tsx']);
		expect(discovery.directories).toEqual(
			expect.arrayContaining([root, join(root, 'src'), join(root, 'src/nested')]),
		);
		expect(discovery.directories).not.toContain(join(root, 'dist'));
	});

	it('keeps linked raw Octane source roots as absolute RPC module IDs', () => {
		const linkedRoot = mkdtempSync(join(tmpdir(), 'octane-rsbuild-linked-source-'));
		try {
			const linkedAction = write(
				linkedRoot,
				'src/action.tsx',
				'module server { export function linkedAction() { return "linked"; } }\n',
			);
			write(
				linkedRoot,
				'src/not-action.tsx',
				'export const documentation = `module server { is syntax }`;\n',
			);

			const discovery = discoverServerModules(root, [root, join(linkedRoot, 'src')]);
			expect(discovery.files).toEqual([linkedAction]);
			expect(discovery.ids).toEqual([realpathSync(linkedAction).replaceAll('\\', '/')]);
			expect(discovery.directories).toContain(join(linkedRoot, 'src'));
		} finally {
			rmSync(linkedRoot, { recursive: true, force: true });
		}
	});
});

describe('production output finalization', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'octane-rsbuild-finalize-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('moves late client metadata beside the server entry before invoking the adapter', async () => {
		write(root, 'build/client/index.html', '<html>client</html>');
		write(root, 'build/client/octane-client-assets.json', '{"/src/Page.tsrx":{}}\n');
		write(root, 'build/client/static/js/octane.js', 'client');
		write(root, 'build/server/entry.js', 'export const handler = true;\n');
		write(root, 'build/server/index.html', '<html>stale</html>');
		const adapt = vi.fn(async () => {});
		const log = vi.fn();
		const config = resolveOctaneConfig({
			build: { outDir: 'build' },
			adapter: { name: 'fixture-adapter', adapt },
		});

		await finalizeOctaneRsbuildOutput({ root, config, log });

		expect(existsSync(join(root, 'build/client/index.html'))).toBe(false);
		expect(existsSync(join(root, 'build/client/octane-client-assets.json'))).toBe(false);
		expect(readFileSync(join(root, 'build/server/index.html'), 'utf8')).toBe('<html>client</html>');
		expect(readFileSync(join(root, 'build/server/octane-client-assets.json'), 'utf8')).toContain(
			'/src/Page.tsrx',
		);
		expect(existsSync(join(root, 'build/client/static/js/octane.js'))).toBe(true);
		expect(adapt).toHaveBeenCalledOnce();
		expect(adapt).toHaveBeenCalledWith(
			expect.objectContaining({
				root,
				outDir: 'build',
				clientDir: join(root, 'build/client'),
				serverDir: join(root, 'build/server'),
				log,
			}),
		);
		expect(log).toHaveBeenCalledWith('Running fixture-adapter adapt()…');
	});

	it('fails before mutating output when a required environment artifact is absent', async () => {
		write(root, 'dist/client/index.html', '<html>client</html>');
		write(root, 'dist/server/entry.js', 'export {};\n');
		const config = resolveOctaneConfig({});

		await expect(finalizeOctaneRsbuildOutput({ root, config })).rejects.toThrow(
			'Client asset metadata was not emitted',
		);
		expect(readFileSync(join(root, 'dist/client/index.html'), 'utf8')).toBe('<html>client</html>');
	});
});
