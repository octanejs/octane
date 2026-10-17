import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let bundle: string;

beforeAll(async () => {
	const result = await build({
		bundle: true,
		format: 'iife',
		globalName: 'routerFixture',
		platform: 'browser',
		write: false,
		stdin: {
			resolveDir: fileURLToPath(new URL('../..', import.meta.url)),
			contents: `export { BaseRootRoute, createBrowserHistory, createHashHistory, createMemoryHistory, createRouter } from '@octanejs/tanstack-router/core';`,
		},
	});
	bundle = result.outputFiles[0]!.text;
	browser = await launchBrowser({ headless: true, channel: 'chromium' });
});

afterAll(async () => browser?.close());

it.each([
	{ mode: 'browser', seed: 'object', navigationState: { saved: true }, writes: 1 },
	{ mode: 'hash', seed: 'object', navigationState: { saved: true }, writes: 1 },
	{ mode: 'router', seed: 'object', navigationState: { saved: true }, writes: 1 },
	{
		mode: 'browser',
		seed: 'object',
		navigationState: { saved: 'original' },
		listenerState: { saved: 'newer' },
		writes: 1,
	},
	{ mode: 'browser', seed: 'empty', navigationState: false, writes: 1 },
	{ mode: 'browser', seed: 'empty', navigationState: undefined, writes: 1 },
	{ mode: 'browser', seed: 'ready', navigationState: 0, writes: 0 },
] as const)('preserves the initial entry ($mode, $seed, $navigationState)', async (scenario) => {
	const page = await browser.newPage();
	try {
		await page.route('http://localhost/octane-router-test/', (route) =>
			route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Router</title>' }),
		);
		await page.goto('http://localhost/octane-router-test/');
		await page.addScriptTag({ content: bundle });
		const result = await page.evaluate((scenario) => {
			const { mode, seed, navigationState } = scenario;
			const api = (window as any).routerFixture;
			const navigation = (window as any).navigation;
			const payload = { owner: { position: 12 }, __TSR_index: 3 };
			const state =
				seed === 'empty'
					? null
					: seed === 'ready'
						? { ...api.createMemoryHistory().location.state, ...payload }
						: payload;
			history.replaceState(state, '');
			if (navigationState !== undefined) navigation.updateCurrentEntry({ state: navigationState });
			if ('listenerState' in scenario) {
				navigation.addEventListener(
					'currententrychange',
					() => navigation.updateCurrentEntry({ state: scenario.listenerState }),
					{ once: true },
				);
			}
			const originalReplace = history.replaceState;
			let writes = 0;
			history.replaceState = function (...args) {
				writes++;
				return originalReplace.apply(this, args);
			};
			const instance =
				mode === 'router'
					? api.createRouter({ routeTree: new api.BaseRootRoute() }).history
					: mode === 'hash'
						? api.createHashHistory()
						: api.createBrowserHistory();
			const result = {
				native: history.state,
				routed: instance.location.state,
				navigation: navigation.currentEntry.getState(),
				writes,
			};
			instance.destroy();
			return result;
		}, scenario);
		expect(result.writes).toBe(scenario.writes);
		expect(result.navigation).toEqual(
			'listenerState' in scenario ? scenario.listenerState : scenario.navigationState,
		);
		expect(result.routed).toEqual(result.native);
		if (scenario.seed !== 'empty') {
			expect(result.native).toMatchObject({ owner: { position: 12 }, __TSR_index: 3 });
		}
	} finally {
		await page.close();
	}
});
