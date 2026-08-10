import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const playwright = vi.hoisted(() => ({
	chromium: { launch: vi.fn() },
	firefox: { launch: vi.fn() },
}));

vi.mock('playwright', () => playwright);

async function loadSelector(value?: string) {
	vi.resetModules();
	if (value === undefined) delete process.env.PLAYWRIGHT_BROWSER;
	else process.env.PLAYWRIGHT_BROWSER = value;
	return import('./playwright-browser.js');
}

afterEach(() => {
	delete process.env.PLAYWRIGHT_BROWSER;
	vi.clearAllMocks();
});

function containsDirectPlaywrightBrowserAccess(source: string): boolean {
	return [
		/(?:^|\n)\s*import\s+(?!type\b)[^;]*\bfrom\s*['"]playwright['"]/,
		/\bimport\s*\(\s*['"]playwright['"]\s*\)/,
		/\brequire\s*\(\s*['"]playwright['"]\s*\)/,
		/\.\s*chromium\b/,
		/\[\s*['"]chromium['"]\s*\]/,
		/\blaunchPersistentContext\s*\(/,
	].some((pattern) => pattern.test(source));
}

describe('repository browser selection', () => {
	it('defaults local runs to Chromium', async () => {
		const selector = await loadSelector();

		expect(selector.browserName).toBe('chromium');
		expect(selector.browserType).toBe(playwright.chromium);
	});

	it.each([
		['chromium', playwright.chromium],
		['firefox', playwright.firefox],
	] as const)('selects %s when requested', async (name, browserType) => {
		const selector = await loadSelector(name);

		expect(selector.browserName).toBe(name);
		expect(selector.browserType).toBe(browserType);
	});

	it('rejects an unsupported engine before launch', async () => {
		await expect(loadSelector('webkit')).rejects.toThrow(
			'Unsupported PLAYWRIGHT_BROWSER "webkit". Expected "chromium" or "firefox".',
		);
		expect(playwright.chromium.launch).not.toHaveBeenCalled();
		expect(playwright.firefox.launch).not.toHaveBeenCalled();
	});

	it('reports how to install the selected missing browser and preserves the cause', async () => {
		const cause = new Error('Executable does not exist');
		playwright.firefox.launch.mockRejectedValueOnce(cause);
		const { launchBrowser } = await loadSelector('firefox');

		const error = await launchBrowser({ headless: true }).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toContain('Firefox could not be launched');
		expect(error.message).toContain('pnpm exec playwright install firefox');
		expect(error.cause).toBe(cause);
	});

	it('preserves launch failures that are unrelated to browser provisioning', async () => {
		const cause = new Error('Target page, context or browser has been closed');
		playwright.firefox.launch.mockRejectedValueOnce(cause);
		const { launchBrowser } = await loadSelector('firefox');

		await expect(launchBrowser({ headless: true })).rejects.toBe(cause);
	});
});

describe('heavy-integration browser ownership', () => {
	it.each([
		["import { chromium } from 'playwright';", true],
		["const { chromium } = await import('playwright');", true],
		["const engine = playwright['chromium'];", true],
		['await browserType.launchPersistentContext(profile);', true],
		["import type { Browser } from 'playwright';", false],
		["import { launchBrowser } from '../../../../test-utils/playwright-browser.js';", false],
	] as const)('classifies scoped Playwright access in %j', (source, forbidden) => {
		expect(containsDirectPlaywrightBrowserAccess(source)).toBe(forbidden);
	});

	it('contains no direct Playwright browser access in the selected browser directories', () => {
		const roots = ['octane', 'dexie', 'react-draggable', 'tiptap', 'three'].map(function (packageName) {
			return resolve(import.meta.dirname, `../packages/${packageName}/tests/browser`);
		});
		// behavior-root intentionally launches Chromium and WebKit for ownership
		// coverage; CI provisions those engines beside PLAYWRIGHT_BROWSER.
		const ownershipCoverageAllowlist = new Set([
			resolve(
				import.meta.dirname,
				'../packages/octane/tests/browser/behavior-root/behavior-root.test.ts',
			),
		]);
		const browserFiles = roots.flatMap(function (root) {
			return readdirSync(root, { recursive: true, withFileTypes: true })
				.filter(function (entry) {
					return entry.isFile() && /\.(?:[cm]?js|tsx?)$/.test(entry.name);
				})
				.map(function (entry) {
					return resolve(entry.parentPath, entry.name);
				});
		});

		const offenders = browserFiles.filter(function (filePath) {
			if (ownershipCoverageAllowlist.has(filePath)) return false;
			const source = readFileSync(filePath, 'utf8');
			return containsDirectPlaywrightBrowserAccess(source);
		});

		expect(offenders).toEqual([]);
		expect(ownershipCoverageAllowlist.size).toBe(1);
		for (const allowed of ownershipCoverageAllowlist) {
			expect(containsDirectPlaywrightBrowserAccess(readFileSync(allowed, 'utf8'))).toBe(true);
		}
	});
});
