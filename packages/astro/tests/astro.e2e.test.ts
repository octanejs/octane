// @vitest-environment node

// Production Astro build → preview → Chromium smoke for @octanejs/astro.
// One build + one preview for the suite; modeled on website/tests/ssr-hydration.e2e.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import {
	reserveFreePort,
	spawnDetached,
	spawnServer,
	stopServer,
	waitForExit,
	waitForServer,
} from './support/server-process.ts';

const PLAYGROUND = join(process.cwd(), 'playground/astro');
const PLAYWRIGHT_ACTION_TIMEOUT = 20_000;
const PLAYWRIGHT_NAVIGATION_TIMEOUT = 15_000;
const SERVER_READY_TIMEOUT = 60_000;

let chromium: typeof import('playwright').chromium;
let browser: import('playwright').Browser;
let build: ChildProcess | undefined;
let preview: ChildProcess | undefined;
let origin = '';

beforeAll(async () => {
	const reserved = await reserveFreePort();
	const port = reserved.port;

	// Hold the port only across the build (website production-server pattern).
	// Preview must bind after release — otherwise --strictPort fails against the
	// reservation listener and probes hang on a bare TCP accept.
	try {
		build = spawnDetached(PLAYGROUND, ['exec', 'astro', 'build'], process.env, 'pipe');
		try {
			await waitForExit(build);
		} catch (error) {
			await stopServer(build);
			build = undefined;
			throw new Error(
				`astro build failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	} catch (error) {
		await stopServer(build);
		build = undefined;
		throw error;
	} finally {
		await reserved.release();
	}

	try {
		preview = spawnServer(PLAYGROUND, [
			'exec',
			'astro',
			'preview',
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort',
		]);
		origin = `http://127.0.0.1:${port}`;
		await waitForServer(preview, origin, SERVER_READY_TIMEOUT);

		try {
			({ chromium } = await import('playwright'));
			browser = await chromium.launch({ headless: true });
		} catch (error) {
			await stopServer(preview);
			preview = undefined;
			throw new Error(
				'[astro.e2e] Chromium is required ' +
					'(run `pnpm --filter @octanejs/astro exec playwright install chromium`): ' +
					(error instanceof Error ? error.message.split('\n')[0] : String(error)),
			);
		}
	} catch (error) {
		await stopServer(build);
		build = undefined;
		await stopServer(preview);
		preview = undefined;
		throw error;
	}
}, 320_000);

afterAll(async () => {
	await browser?.close();
	await stopServer(preview);
	await stopServer(build);
});

/** Astro clears `ssr` after each island hydrator returns. */
async function waitForIslandsHydrated(page: import('playwright').Page) {
	await page.waitForFunction(() => document.querySelector('astro-island[ssr]') == null);
}

/** Website E2E-style double-rAF so late console diagnostics settle. */
async function waitForPaintStable(page: import('playwright').Page) {
	await page.waitForFunction(
		() =>
			new Promise<boolean>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))),
			),
	);
}

async function openHome() {
	const context = await browser.newContext();
	const page = await context.newPage();
	page.setDefaultTimeout(PLAYWRIGHT_ACTION_TIMEOUT);
	page.setDefaultNavigationTimeout(PLAYWRIGHT_NAVIGATION_TIMEOUT);

	const pageErrors: string[] = [];
	const hydrationMismatches: string[] = [];
	page.on('pageerror', (e) => pageErrors.push(String(e)));
	page.on('console', (msg) => {
		const text = msg.text();
		if (msg.type() === 'error') pageErrors.push(text);
		if (/hydration|Hydration|mismatch/i.test(text)) {
			hydrationMismatches.push(text);
		}
	});

	await page.goto(origin + '/', { waitUntil: 'load' });
	await page.waitForSelector('[data-testid="greeting"]');
	await waitForIslandsHydrated(page);
	await waitForPaintStable(page);

	return {
		page,
		context,
		pageErrors,
		hydrationMismatches,
		async close() {
			await context.close();
		},
	};
}

describe('Astro + Octane production smoke', () => {
	it('SSRs Greeting text into the initial HTML without client JS', async () => {
		const res = await fetch(origin + '/');
		expect(res.ok).toBe(true);
		const html = await res.text();
		expect(html).toContain('data-testid="greeting"');
		expect(html).toContain('Hello, Astro');
	});

	it('SSRs Greeting text into the initial page', async () => {
		const session = await openHome();
		try {
			const text = await session.page.getByTestId('greeting').textContent();
			expect(text?.trim()).toBe('Hello, Astro');
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});

	it('hydrates client:load Counter and increments on click', async () => {
		const session = await openHome();
		try {
			const counter = session.page.getByTestId('counter');
			expect((await counter.textContent())?.trim()).toBe('Count: 3');
			await counter.click();
			await expect.poll(async () => (await counter.textContent())?.trim()).toBe('Count: 4');
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});

	it('mounts client:only="octane" badge', async () => {
		const session = await openHome();
		try {
			const badge = session.page.getByTestId('client-only-badge');
			await badge.waitFor({ state: 'visible' });
			expect(await badge.isVisible()).toBe(true);
			expect(await badge.textContent()).toMatch(/Mounted client-only on/);
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});

	it('keeps default slot children after hydration', async () => {
		const session = await openHome();
		try {
			const child = session.page.getByTestId('panel-child');
			expect(await child.count()).toBe(1);
			expect((await child.textContent())?.trim()).toBe(
				'Children from Astro into an Octane island.',
			);
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});

	it('keeps named footer-note slot after hydration', async () => {
		const session = await openHome();
		try {
			const footerChild = session.page.getByTestId('panel-footer-child');
			expect(await footerChild.count()).toBe(1);
			expect((await footerChild.textContent())?.trim()).toBe('Named footer slot.');
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});

	it('emits scoped Octane style tags from islands', async () => {
		const session = await openHome();
		try {
			const styleCount = await session.page.locator('style[data-octane]').count();
			expect(styleCount).toBeGreaterThan(0);
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});

	it('leaves no trailing <!--astro:end--> on the hydrated Panel island', async () => {
		const session = await openHome();
		try {
			const hasAstroEnd = await session.page.evaluate(() => {
				const island = document.querySelector('astro-island[component-export="Panel"]');
				if (!island) return true;
				return [...island.childNodes].some(
					(n) => n.nodeType === Node.COMMENT_NODE && n.nodeValue === 'astro:end',
				);
			});
			expect(hasAstroEnd).toBe(false);
			expect(session.pageErrors).toEqual([]);
			expect(session.hydrationMismatches).toEqual([]);
		} finally {
			await session.close();
		}
	});
});
