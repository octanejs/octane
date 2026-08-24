import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { launchBrowser } from '../../../../test-utils/playwright-browser.js';
import { octane } from '../../../octane/src/compiler/vite.js';

const HERE = new URL('.', import.meta.url).pathname;
let server: ViteDevServer;
let baseUrl: string;
let cacheDir: string;

beforeAll(async () => {
	cacheDir = await mkdtemp(resolve(tmpdir(), 'octane-waypoint-vite-'));
	server = await createServer({
		cacheDir,
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [octane({ requireDirective: true }), react()],
		resolve: {
			dedupe: ['react', 'react-dom'],
			alias: [
				{
					find: /^octane$/,
					replacement: new URL('../../../octane/src/index.ts', import.meta.url).pathname,
				},
			],
		},
		server: { host: '127.0.0.1', port: 0 },
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port');
	baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
	await server?.close();
	if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

describe.sequential('waypoint real-browser parity', () => {
	// @parity-case browser:rapid-crossing
	it('matches React callback order while rapidly crossing the viewport', async () => {
		const browser = await launchBrowser({ headless: true });
		const context = await browser.newContext({ viewport: { width: 800, height: 100 } });
		try {
			const page = await context.newPage();
			const failures: string[] = [];
			page.on('pageerror', (error) => failures.push(error.message));
			await page.goto(baseUrl);
			await page.waitForFunction(() => Boolean(window.__waypointParity));
			await page.waitForTimeout(16);
			await page.evaluate(() => {
				window.__waypointParity.prepare();
				window.__waypointParity.move(120, 140);
				window.__waypointParity.reset();
				window.__waypointParity.move(-40, -20);
			});
			const states = await page.evaluate(() => ({
				octane: window.__waypointParity.state('octane'),
				react: window.__waypointParity.state('react'),
			}));
			expect(states.octane).toEqual(states.react);
			expect(states.octane.map((entry) => entry.callback)).toEqual(['position', 'enter', 'leave']);
			expect(failures).toEqual([]);
		} finally {
			await Promise.allSettled([context.close(), browser.close()]);
		}
	});

	// @parity-case performance:scroll-budget
	it('handles 500 scroll measurements inside the browser budget', async () => {
		const browser = await launchBrowser({ headless: true });
		const context = await browser.newContext({ viewport: { width: 800, height: 100 } });
		try {
			const page = await context.newPage();
			await page.goto(baseUrl);
			await page.waitForFunction(() => Boolean(window.__waypointParity));
			await page.waitForTimeout(16);
			await page.evaluate(() => window.__waypointParity.prepare());
			const elapsed = await page.evaluate(() => window.__waypointParity.benchmark());
			expect(elapsed).toBeLessThan(1_000);
		} finally {
			await Promise.allSettled([context.close(), browser.close()]);
		}
	});
});
