// @octanejs/vite-plugin unit tests — the pure decision logic the website
// surfaced gaps in: the dev-middleware's Vite-owned URL filter, `octane()`
// option forwarding to the bundled compiler, the appType default, and the
// config resolution of `router.preHydrate` / RenderRoute `status`.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { describe, it, expect } from 'vitest';
import { octane, isViteOwnedUrl, resolveOctaneConfig, RenderRoute } from '../src/index.js';
import { RESOLVED_ADAPTER_BROWSER_STUB_ID } from '../src/project-codegen.js';
import type { Component } from '@octanejs/vite-plugin';

function url(u: string): URL {
	return new URL(u, 'http://localhost');
}

// Use this package as the fake Vite root: '/src/index.js' and '/types/index.d.ts'
// are real files under it, '/docs/v2.0' etc. are not.
const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

describe('isViteOwnedUrl', () => {
	it('skips Vite-internal namespaces and module/asset requests', () => {
		expect(isViteOwnedUrl(url('/@vite/client'))).toBe(true);
		expect(isViteOwnedUrl(url('/@id/virtual:octane-hydrate'))).toBe(true);
		expect(isViteOwnedUrl(url('/@fs/Users/x/repo/src/main.ts'))).toBe(true);
		expect(isViteOwnedUrl(url('/__open-in-editor?file=x'))).toBe(true);
		expect(isViteOwnedUrl(url('/node_modules/.vite/deps/chunk.js'))).toBe(true);
		expect(isViteOwnedUrl(url('/src/main.ts'))).toBe(true);
		expect(isViteOwnedUrl(url('/src/app/App.tsrx?v=abc123'))).toBe(true);
		expect(isViteOwnedUrl(url('/favicon.svg'))).toBe(true);
		expect(isViteOwnedUrl(url('/src/worker?worker'))).toBe(true);
		expect(isViteOwnedUrl(url('/src/logo?url'))).toBe(true);
	});

	it('keeps page navigations', () => {
		expect(isViteOwnedUrl(url('/'))).toBe(false);
		expect(isViteOwnedUrl(url('/docs'))).toBe(false);
		expect(isViteOwnedUrl(url('/docs/quick-start'))).toBe(false);
		expect(isViteOwnedUrl(url('/definitely/not/a/page'))).toBe(false);
		expect(isViteOwnedUrl(url('/search?q=octane'))).toBe(false);
		// A bare dotfile segment is not an extension.
		expect(isViteOwnedUrl(url('/.well-known'))).toBe(false);
		// VALUED params matching a marker name are app query strings — Vite's
		// transform markers are always bare (`?url`, `?raw`, `&import`).
		expect(isViteOwnedUrl(url('/docs?url=https://example.com'))).toBe(false);
		expect(isViteOwnedUrl(url('/page?raw=1'))).toBe(false);
		expect(isViteOwnedUrl(url('/jobs?worker=nurse'))).toBe(false);
	});

	it('with fileRoots, an extension only counts when a real file backs it', () => {
		// Real files under the root → Vite's.
		expect(isViteOwnedUrl(url('/src/index.js'), [PKG_ROOT])).toBe(true);
		expect(isViteOwnedUrl(url('/types/index.d.ts?v=abc'), [PKG_ROOT])).toBe(true);
		// Dotted PAGE urls → SSR them.
		expect(isViteOwnedUrl(url('/docs/v2.0'), [PKG_ROOT])).toBe(false);
		expect(isViteOwnedUrl(url('/users/jane.doe'), [PKG_ROOT])).toBe(false);
		// A missing asset also SSRs (the app's 404 page beats a bare dev 404).
		expect(isViteOwnedUrl(url('/missing.png'), [PKG_ROOT])).toBe(false);
		// Multiple roots (root + publicDir).
		expect(isViteOwnedUrl(url('/src/index.js'), ['/nowhere', PKG_ROOT])).toBe(true);
		// Non-file checks are unaffected by fileRoots.
		expect(isViteOwnedUrl(url('/@vite/client'), [PKG_ROOT])).toBe(true);
		expect(isViteOwnedUrl(url('/src/worker?worker'), [PKG_ROOT])).toBe(true);
	});
});

describe('octane() plugin factory', () => {
	it('types components with the live props-first ABI', () => {
		const Component: Component<{ value: string }> = (props) => props.value;
		expect(Component({ value: 'props-first' }, undefined)).toBe('props-first');
	});

	it('forwards `exclude` to the bundled compiler (hook-slotting skip)', () => {
		const [compiler] = octane({ exclude: ['/packages/tanstack-router/src/'] });
		// Vite calls config() before transforms; pin the synthetic project root so
		// linked paths outside it are correctly treated as external packages.
		(compiler.config as (config: { root: string }) => unknown)({ root: '/repo' });
		const code =
			"import { useState } from 'octane';\nexport function useThing() { return useState(0); }\n";
		const transform = compiler.transform as (code: string, id: string) => unknown;

		// A pnpm-symlinked binding source resolves to /packages/*/src — excluded,
		// so the hand-slot-forwarding file passes through untouched.
		expect(transform.call({}, code, '/repo/packages/tanstack-router/src/useRouter.ts')).toBeNull();
		// App code is still slotted.
		expect(transform.call({}, code, '/repo/src/useThing.ts')).not.toBeNull();
	});

	it("defaults appType to 'custom' for dev, but respects the user and `vite preview`", async () => {
		const [, meta] = octane();
		const config = meta.config as (
			userConfig: object,
			env: object,
		) => Promise<{ appType?: string }>;

		expect((await config({}, { command: 'serve', mode: 'development' })).appType).toBe('custom');
		// An explicit user appType wins.
		expect(
			(await config({ appType: 'spa' }, { command: 'serve', mode: 'development' })).appType,
		).toBe(undefined);
		// `vite preview` serves static files with Vite's own fallback; the
		// production SSR build is previewed with `octane-preview` instead.
		expect(
			(await config({}, { command: 'serve', mode: 'production', isPreview: true })).appType,
		).toBe(undefined);
	});
});

describe('resolveOctaneConfig', () => {
	const entry = ['App', '/src/App.tsrx'] as const;

	it('passes router.preHydrate through and validates its shape', () => {
		const resolved = resolveOctaneConfig({
			router: {
				routes: [new RenderRoute({ path: '/', entry })],
				preHydrate: '/src/pre-hydrate.ts',
			},
		});
		expect(resolved.router.preHydrate).toBe('/src/pre-hydrate.ts');
		// Absent stays absent.
		expect(resolveOctaneConfig({}).router.preHydrate).toBe(undefined);
		// Must be a Vite-root path the browser can dynamic-import.
		expect(() =>
			resolveOctaneConfig({ router: { routes: [], preHydrate: 'src/pre-hydrate.ts' } }),
		).toThrow(/preHydrate/);
	});

	it('accepts an integer RenderRoute status and rejects anything else', () => {
		const route = new RenderRoute({ path: '/*splat', entry, status: 404 });
		expect(route.status).toBe(404);
		expect(resolveOctaneConfig({ router: { routes: [route] } }).router.routes[0]).toBe(route);
		expect(() =>
			resolveOctaneConfig({
				router: { routes: [new RenderRoute({ path: '/', entry, status: 4.04 })] },
			}),
		).toThrow(/status/);
	});

	it('accepts importable root boundary entries and rejects runtime functions', () => {
		const resolved = resolveOctaneConfig({
			rootBoundary: {
				pending: '/src/Pending.tsrx',
				catch: ['RootCatch', '/src/Catch.tsrx'],
			},
		});
		expect(resolved.rootBoundary).toEqual({
			pending: '/src/Pending.tsrx',
			catch: ['RootCatch', '/src/Catch.tsrx'],
		});
		expect(() =>
			resolveOctaneConfig({
				// @ts-expect-error Config must be serializable across client/server builds.
				rootBoundary: { pending: () => undefined },
			}),
		).toThrow(/rootBoundary\.pending/);
	});
});

describe('server-only adapter browser stub', () => {
	const [, meta] = octane();
	const resolveId = meta.resolveId as (
		id: string,
		importer?: string,
		options?: { ssr?: boolean },
	) => Promise<string | null>;
	const load = meta.load as (id: string) => Promise<string | undefined>;

	it('client-side imports of adapter packages resolve to the stub, server gets the real one', async () => {
		for (const id of ['@octanejs/adapter-vercel', '@ripple-ts/adapter-node']) {
			expect(await resolveId(id, undefined, { ssr: false })).toBe(RESOLVED_ADAPTER_BROWSER_STUB_ID);
		}
		expect(await resolveId('@octanejs/adapter-vercel', undefined, { ssr: true })).toBe(null);
	});

	it('the stub covers the octane adapter surface with no node builtins', async () => {
		const source = (await load(RESOLVED_ADAPTER_BROWSER_STUB_ID)) as string;
		// The union of the listed adapters' public names — a client import of any
		// of them must resolve (and only throw on USE).
		for (const name of ['vercel', 'adapt', 'serve']) {
			expect(source).toContain(`export function ${name}`);
		}
		expect(source).not.toContain('node:');
	});
});
