import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const playwright = vi.hoisted(() => ({
	chromium: { launch: vi.fn() },
	devices: {},
}));

vi.mock('playwright', () => playwright);

async function loadBrowserLauncher() {
	vi.resetModules();
	return import('./playwright-browser.js');
}

afterEach(() => {
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

describe('repository Chromium launcher', () => {
	it('always uses Chromium', async () => {
		const selector = await loadBrowserLauncher();

		expect(selector.browserName).toBe('chromium');
	});

	it('reports how to install missing Chromium and preserves the cause', async () => {
		const cause = new Error('Executable does not exist');
		playwright.chromium.launch.mockRejectedValueOnce(cause);
		const { launchBrowser } = await loadBrowserLauncher();

		const error = await launchBrowser({ headless: true }).catch((failure: unknown) => failure);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toContain('Chromium could not be launched');
		expect(error.message).toContain('pnpm exec playwright install chromium');
		expect(error.cause).toBe(cause);
	});

	it('preserves launch failures that are unrelated to browser provisioning', async () => {
		const cause = new Error('Target page, context or browser has been closed');
		playwright.chromium.launch.mockRejectedValueOnce(cause);
		const { launchBrowser } = await loadBrowserLauncher();

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
		const roots = [
			...[
				'octane',
				'dexie',
				'draggable',
				'syntax-highlighter',
				'textarea-autosize',
				'tiptap',
				'three',
			].map(function (packageName) {
				return resolve(import.meta.dirname, `../packages/${packageName}/tests/browser`);
			}),
			resolve(import.meta.dirname, '../playground/octane/tests/doom'),
			resolve(import.meta.dirname, '../packages/colorful/tests/browser'),
			resolve(import.meta.dirname, '../packages/popper/tests/browser'),
			resolve(import.meta.dirname, '../packages/pdf/tests/browser'),
			resolve(import.meta.dirname, '../packages/pdf/tests/feasibility'),
		];
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
			const source = readFileSync(filePath, 'utf8');
			return containsDirectPlaywrightBrowserAccess(source);
		});

		expect(offenders).toEqual([]);
	});
});
