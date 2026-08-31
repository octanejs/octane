import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import { build, preview, type PreviewServer } from 'vite';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../test-utils/playwright-browser.js';
import type {} from './stock-react-root-probes.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const requireOctane = createRequire(new URL('../../packages/octane/package.json', import.meta.url));
const reactAliases = [
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	'react-dom/client',
].map((specifier) => ({
	find: new RegExp(`^${specifier.replaceAll('/', '\\/')}$`),
	replacement: requireOctane.resolve(specifier),
}));
const evidence: Record<string, unknown> = {};
const browserVersions: Record<string, string> = {};

afterAll(async () => {
	const destination = process.env.REACT_COMPAT_EVIDENCE_PATH;
	if (destination) {
		await writeFile(
			destination,
			JSON.stringify(
				{
					schemaVersion: 1,
					reactVersion: '19.2.7',
					runner: { node: process.version, platform: process.platform, arch: process.arch },
					browserVersions,
					stockRootControls: evidence,
				},
				null,
				2,
			) + '\n',
		);
	}
});

describe.each(['development', 'production'] as const)('stock React root — %s browser', (mode) => {
	let directory: string;
	let server: PreviewServer;
	let browser: Browser;
	let page: Page;
	let url: string;
	const failures: string[] = [];

	beforeAll(async () => {
		directory = await mkdtemp(join(tmpdir(), 'react-compat-stock-control-'));
		const config = {
			configFile: false as const,
			root: here,
			logLevel: 'error' as const,
			plugins: [react()],
			oxc: { jsx: { development: mode === 'development' } },
			resolve: { alias: reactAliases },
			define: { 'process.env.NODE_ENV': JSON.stringify(mode) },
			build: { outDir: directory, emptyOutDir: false, minify: false as const },
		};
		await build(config);
		server = await preview({ ...config, preview: { host: '127.0.0.1', port: 0 } });
		const address = server.httpServer.address();
		if (!address || typeof address === 'string') throw new Error('Probe server has no TCP port');
		url = `http://127.0.0.1:${address.port}`;
		browser = await launchBrowser({ headless: true });
		browserVersions[mode] = browser.version();
		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') failures.push(message.text());
		});
		await page.goto(url);
		await page.waitForFunction(() => window.reactCompatProbes?.reactVersion === '19.2.7');
	});

	afterAll(async () => {
		await page?.close();
		await browser?.close();
		await server?.close();
		if (directory) await rm(directory, { recursive: true, force: true });
	});

	it('observes urgent fallback but cannot observe a retained transition through fallback effects', async () => {
		const urgent = await page.evaluate(() => window.reactCompatProbes.runUrgentSuspension());
		const transition = await page.evaluate(() =>
			window.reactCompatProbes.runTransitionSuspension(),
		);
		expect(urgent.observations).toMatchObject({
			waiting: { resourceRequested: true, fallbackEffectObserved: true, fallbackVisible: true },
			settled: { content: 'resolved' },
		});
		expect(transition.observations).toMatchObject({
			waiting: {
				resourceRequested: true,
				transitionPending: true,
				fallbackEffectObserved: false,
				fallbackVisible: false,
				previousContentVisible: true,
				previousContentIdentityPreserved: true,
			},
			settled: { content: 'resolved', transitionPending: false, fallbackEffectEverObserved: false },
		});
		evidence[`${mode}:suspension`] = { urgent, transition };
		expect(failures).toEqual([]);
	});

	it.each(['detached', 'hidden'] as const)(
		'%s host still has committed React effects and a live external portal',
		async (kind) => {
			const result = await page.evaluate(
				(name) =>
					name === 'detached'
						? window.reactCompatProbes.runDetachedRoot()
						: window.reactCompatProbes.runHiddenRoot(),
				kind,
			);
			expect(result.observations).toMatchObject({
				beforeUnmount: {
					localVisible: false,
					localIdentityPreserved: true,
					refActive: true,
					layoutActive: true,
					passiveActive: true,
					externalPortalVisible: true,
					subscriptionMessage: `while-${kind}`,
				},
				afterUnmount: {
					refActive: false,
					layoutActive: false,
					passiveActive: false,
					externalPortalPresent: false,
					subscriptionMessage: `while-${kind}`,
					cleanups: ['layout', 'passive', 'ref'],
				},
			});
			evidence[`${mode}:${kind}`] = result;
			expect(failures).toEqual([]);
		},
	);
});
