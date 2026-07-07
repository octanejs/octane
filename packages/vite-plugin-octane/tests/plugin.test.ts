// @octanejs/vite-plugin unit tests — the pure decision logic the website
// surfaced gaps in: the dev-middleware's Vite-owned URL filter, `octane()`
// option forwarding to the bundled compiler, the appType default, and the
// config resolution of `router.preHydrate` / RenderRoute `status`.
import { describe, it, expect } from 'vitest';
import { octane, isViteOwnedUrl, resolveOctaneConfig, RenderRoute } from '../src/index.js';

function url(u: string): URL {
	return new URL(u, 'http://localhost');
}

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
	});
});

describe('octane() plugin factory', () => {
	it('forwards `exclude` to the bundled compiler (hook-slotting skip)', () => {
		const [compiler] = octane({ exclude: ['/packages/router/src/'] });
		const code =
			"import { useState } from 'octane';\nexport function useThing() { return useState(0); }\n";
		const transform = compiler.transform as (code: string, id: string) => unknown;

		// A pnpm-symlinked binding source resolves to /packages/*/src — excluded,
		// so the hand-slot-forwarding file passes through untouched.
		expect(transform.call({}, code, '/repo/packages/router/src/useRouter.ts')).toBeNull();
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
});
