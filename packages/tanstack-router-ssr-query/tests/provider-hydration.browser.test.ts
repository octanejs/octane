import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { build } from 'vite';
import { chromium } from 'playwright';
import { renderToString } from 'octane/server';
import { QueryClient, dehydrate } from '@octanejs/tanstack-query';
import { setupRouterSsrQueryIntegration } from '@octanejs/tanstack-router-ssr-query';
import { octane } from '../../octane/src/compiler/vite.js';
import { makeSsrRouter } from '../../tanstack-router/tests/_fixtures/ssr.tsrx';
import { ExistingWrapper, ProviderHydration, queryKey } from './_fixtures/provider-hydration.tsrx';

const root = resolve(import.meta.dirname, '../../..');
const fromOctane = createRequire(resolve(root, 'packages/octane/package.json'));

// @parity-case browser:ssr-query-provider-hydration
it('hydrates query providers without losing input state and releases page and portal subscriptions', async () => {
	const serverClient = new QueryClient();
	serverClient.setQueryData(queryKey, 'server cached');
	const router = makeSsrRouter();
	router.options.Wrap = ExistingWrapper;
	setupRouterSsrQueryIntegration({ router, queryClient: serverClient });
	const html = renderToString(ProviderHydration, { Wrap: router.options.Wrap! }).html;
	const state = dehydrate(serverClient);
	serverClient.clear();
	expect(html).toContain('server cached');

	const result = await build({
		configFile: false,
		root,
		mode: 'production',
		logLevel: 'error',
		plugins: [
			{
				name: 'ssr-query-browser-runtime',
				enforce: 'pre',
				resolveId(id) {
					if (id === 'octane' || id.startsWith('octane/')) return fromOctane.resolve(id);
				},
			},
			octane({ hmr: false, profile: false }),
		],
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		build: {
			write: false,
			minify: 'esbuild',
			target: 'esnext',
			lib: {
				entry: resolve(
					root,
					'packages/tanstack-router-ssr-query/tests/_fixtures/provider-hydration-client.tsrx',
				),
				formats: ['iife'],
				name: 'SSR_QUERY_BROWSER',
			},
		},
	});
	const outputs = (Array.isArray(result) ? result : [result]).flatMap((entry) => entry.output);
	const chunks = outputs.filter((entry) => entry.type === 'chunk');
	expect(chunks).toHaveLength(1);
	const chunk = chunks[0]!;
	expect(chunk.imports).toEqual([]);
	expect(
		Object.keys(chunk.modules).filter((id) =>
			/\/node_modules\/(?:react|react-dom|@tanstack\/react-router)(?:\/|$)/.test(id),
		),
	).toEqual([]);
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		page.setDefaultTimeout(5000);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (/hydration.*mismatch/i.test(message.text())) errors.push(message.text());
		});
		await page.setContent(
			`<main id="first">${html}</main><aside id="first-portal"></aside><main id="second">${html}</main><aside id="second-portal"></aside>`,
		);
		await page.addScriptTag({ content: chunk.code });
		const firstInput = page.locator('#first input');
		await firstInput.fill('edited before hydration');
		await firstInput.focus();
		await page.evaluate((state) => {
			const scope = window as any;
			scope.savedInput = document.querySelector('#first input');
			scope.savedOutput = document.querySelector('#first output');
			scope.first = scope.SSR_QUERY_BROWSER.mount(
				document.querySelector('#first'),
				document.querySelector('#first-portal'),
				state,
			);
			scope.second = scope.SSR_QUERY_BROWSER.mount(
				document.querySelector('#second'),
				document.querySelector('#second-portal'),
				state,
			);
		}, state);
		await expect
			.poll(() => page.locator('#first-portal output').textContent())
			.toBe('server cached');
		await expect
			.poll(() => page.locator('#second-portal output').textContent())
			.toBe('server cached');
		expect(await firstInput.inputValue()).toBe('edited before hydration');
		expect(await page.evaluate(() => document.activeElement === (window as any).savedInput)).toBe(
			true,
		);
		expect(
			await page.evaluate(
				() => document.querySelector('#first output') === (window as any).savedOutput,
			),
		).toBe(true);
		expect(await page.locator('#first [data-existing-wrapper]').count()).toBe(1);
		await page.evaluate(() => (window as any).first.update('client updated'));
		await expect.poll(() => page.locator('#first output').textContent()).toBe('client updated');
		await expect
			.poll(() => page.locator('#first-portal output').textContent())
			.toBe('client updated');
		expect(await page.locator('#second output').textContent()).toBe('server cached');
		expect(await page.locator('#second-portal output').textContent()).toBe('server cached');
		expect(await page.evaluate(() => (window as any).first.observers())).toBeGreaterThan(0);
		await page.evaluate(() => (window as any).first.unmount());
		await expect.poll(() => page.evaluate(() => (window as any).first.observers())).toBe(0);
		expect(await page.locator('#first').textContent()).toBe('');
		expect(await page.locator('#first-portal').textContent()).toBe('');
		await page.evaluate(() => {
			(window as any).first.update('after unmount');
			(window as any).second.update('still mounted');
		});
		await expect.poll(() => page.locator('#second output').textContent()).toBe('still mounted');
		expect(await page.locator('#first').textContent()).toBe('');
		await page.evaluate(() => {
			(window as any).second.unmount();
			(window as any).first.clear();
			(window as any).second.clear();
		});
		expect(await page.locator('#second-portal').textContent()).toBe('');
		expect(errors).toEqual([]);
	} finally {
		await browser.close();
	}
}, 60_000);
