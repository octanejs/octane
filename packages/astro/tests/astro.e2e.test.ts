// @vitest-environment node

// Production Astro build → preview → Chromium smoke for @octanejs/astro.
// One build + one preview for the suite; modeled on website/tests/ssr-hydration.e2e.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';
import {
	reserveFreePort,
	spawnServer,
	stopServer,
	waitForServer,
} from './support/server-process.ts';

const PLAYGROUND = join(process.cwd(), 'playground/astro');
const PLAYWRIGHT_ACTION_TIMEOUT = 20_000;
const PLAYWRIGHT_NAVIGATION_TIMEOUT = 15_000;
const SERVER_READY_TIMEOUT = 60_000;

let chromium: typeof import('playwright').chromium;
let browser: import('playwright').Browser;
let preview: ChildProcess | undefined;
let origin = '';

beforeAll(async () => {
	const reserved = await reserveFreePort();
	const port = reserved.port;

	const build = spawn('pnpm', ['exec', 'astro', 'build'], {
		cwd: PLAYGROUND,
		stdio: 'pipe',
		env: process.env,
	});
	let buildOut = '';
	build.stdout?.on('data', (chunk: Buffer) => {
		buildOut += chunk.toString();
	});
	build.stderr?.on('data', (chunk: Buffer) => {
		buildOut += chunk.toString();
	});
	const buildCode = await new Promise<number | null>((resolve) => {
		build.on('exit', (code) => resolve(code));
	});
	if (buildCode !== 0) {
		await reserved.release();
		throw new Error(`astro build failed (exit ${buildCode}):\n${buildOut}`);
	}

	await reserved.release();

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
}, 320_000);

afterAll(async () => {
	await browser?.close();
	await stopServer(preview);
});

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
			await session.page.getByTestId('panel').waitFor({ state: 'visible' });
			expect((await session.page.getByTestId('panel-child').textContent())?.trim()).toBe(
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
			await session.page.getByTestId('panel-footer').waitFor({ state: 'visible' });
			expect((await session.page.getByTestId('panel-footer-child').textContent())?.trim()).toBe(
				'Named footer slot.',
			);
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
});
