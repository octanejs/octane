import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import * as serverRuntime from 'octane/server';
import { RenderRoute } from '../src/routes.js';
import { createClientBuildState } from '../src/client-build.js';
import { handleRenderRoute } from '../src/server/render-route.js';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it('refuses the first stateful transform after feature-free HMR and permits a fresh-generation retry', () => {
	const reloads: string[] = [];
	const builds = createClientBuildState((buildId) => reloads.push(buildId));
	const original = builds.buildId;
	const transform = (streamedSignals: boolean) => {
		builds.record('/project', '/project/src/state.ts', [], streamedSignals);
		return 'runnable module';
	};
	expect(transform(false)).toBe('runnable module');
	builds.noteHotUpdate();
	expect(transform(false)).toBe('runnable module');
	expect(reloads).toEqual([]);
	expect(builds.buildId).toBe(original);
	expect(() => transform(true)).toThrow(/Reload this document/);
	expect(builds.buildId).not.toBe(original);
	expect(reloads).toEqual([builds.buildId]);
	expect(transform(true)).toBe('runnable module');
	expect(reloads).toHaveLength(1);
});

it('accepts initial signal discovery without reloading and keeps independent slice discovery intact', () => {
	const builds = createClientBuildState(() => {
		throw new Error('unexpected reload');
	});
	const original = builds.buildId;
	builds.record('/project', '/project/src/state.ts', [], true);
	expect(builds.hasStatefulModules).toBe(true);
	expect(builds.buildId).toBe(original);
	builds.record('/project', '/project/src/Page.tsrx?import', [
		{ boundaryId: 'weather', request: '/src/Page.tsrx?octane-hydrate=weather' },
	]);
	builds.record('/project', '/project/src/Page.tsrx?octane-hydrate=weather', []);
	expect(builds.independentHydration()?.resolve?.('weather')).toEqual({
		moduleId: '/src/Page.tsrx?octane-hydrate=weather',
		styles: [],
	});
});

it.each([false, true])(
	'serializes first-load compiler discovery without enabling absent features (%s)',
	async (independent) => {
		const root = mkdtempSync(join(tmpdir(), 'octane-dev-build-'));
		roots.push(root);
		writeFileSync(
			join(root, 'index.html'),
			'<html><head><!--ssr-head--></head><body><div id="root"><!--ssr-body--></div></body></html>',
		);
		const builds = createClientBuildState();
		const route = new RenderRoute({ path: '/', entry: '/src/Page.tsrx' });
		const vite = {
			config: { root },
			async ssrLoadModule(id: string) {
				if (id === 'octane/server') return serverRuntime;
				builds.record(
					root,
					join(root, 'src/Page.tsrx') + '?import',
					independent
						? [{ boundaryId: 'weather', request: '/src/Page.tsrx?octane-hydrate=weather' }]
						: [],
				);
				return { default: () => 'weather page' };
			},
			transformIndexHtml: async (_path: string, html: string) => html,
			ssrFixStacktrace() {},
		};
		const render = async () => {
			const request = new Request('https://example.test/');
			const response = await handleRenderRoute(
				route,
				{ request, url: new URL(request.url), params: {}, state: new Map() } as any,
				vite as any,
				undefined,
				builds.independentHydration(),
				() => builds.metadata(),
			);
			expect(response.status).toBe(200);
			const html = await response.text();
			expect(html).toContain('weather page');
			expect(html.includes('data-octane-stream')).toBe(independent);
			expect(html.includes('data-octane-hydrate-src')).toBe(independent);
			return JSON.parse(html.match(/<script id="__octane_data"[^>]*>([\s\S]*?)<\/script>/)![1]);
		};
		const first = await render();
		const second = await render();
		expect(first.clientBuild).toEqual({
			version: 1,
			buildId: builds.buildId,
			mode: 'development',
			capabilities: { independentHydration: independent },
		});
		expect(first.streamedSignals.buildId).toBe(first.clientBuild.buildId);
		expect(first.streamedSignals.documentId).toBeTypeOf('string');
		expect(second.streamedSignals.documentId).not.toBe(first.streamedSignals.documentId);
		builds.invalidate(join(root, 'src/Page.tsrx'));
		const updated = await render();
		expect(updated.clientBuild.buildId).not.toBe(first.clientBuild.buildId);
		expect(updated.streamedSignals.buildId).toBe(updated.clientBuild.buildId);
	},
);
