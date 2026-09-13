import { expect, test, type Page } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

test.beforeEach(async ({ page }) => {
	runtimeDiagnostics.set(page, collectBrowserDiagnostics(page));
	await page.goto('/?activate=1');
	await expect(page.getByTestId('grab-smoke-target')).toBeVisible();
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = runtimeDiagnostics.get(page);
	if (diagnostics === undefined) return;
	try {
		await settleBrowserFrames(page);
		diagnostics.assertClean(testInfo.title);
	} finally {
		diagnostics.stop();
	}
});

test('activates grab and mounts the overlay host', async ({ page }) => {
	await expect
		.poll(async () =>
			page.evaluate(() => {
				const api = (window as Window & { __OCTANE_GRAB__?: { isActive?: () => boolean } })
					.__OCTANE_GRAB__;
				return Boolean(api?.isActive?.());
			}),
		)
		.toBe(true);

	const hasOverlayHost = await page.evaluate(() =>
		[...document.querySelectorAll('*')].some(
			(node) => node.getAttribute?.('data-react-grab') != null && Boolean(node.shadowRoot),
		),
	);
	expect(hasOverlayHost).toBe(true);

	const todo = page.getByText('Buy groceries', { exact: true });
	const box = await todo.boundingBox();
	expect(box).toBeTruthy();
	// Grab freezes the page with `html { pointer-events: none }`; Playwright's
	// hover action refuses that, so drive the pointer directly.
	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await expect
		.poll(async () =>
			page.evaluate(() => {
				const api = (
					window as Window & {
						__OCTANE_GRAB__?: {
							getState?: () => { isSelectionBoxVisible?: boolean; targetElement?: Element | null };
						};
					}
				).__OCTANE_GRAB__;
				const state = api?.getState?.();
				return Boolean(state?.isSelectionBoxVisible && state.targetElement);
			}),
		)
		.toBe(true);
});

test('toolbar is horizontally centered when it first becomes visible', async ({ page }) => {
	const handle = await page.waitForFunction(() => {
		const host = [...document.querySelectorAll('*')].find(
			(node) => node.getAttribute?.('data-react-grab') != null,
		);
		const toolbar = host?.shadowRoot?.querySelector('[data-react-grab-toolbar]');
		if (!toolbar) return null;
		const opacity = Number.parseFloat(getComputedStyle(toolbar).opacity);
		if (!(opacity > 0.2)) return null;
		const rect = toolbar.getBoundingClientRect();
		return {
			offsetFromCenter: rect.left + rect.width / 2 - document.documentElement.clientWidth / 2,
		};
	});
	const metrics = (await handle.jsonValue()) as { offsetFromCenter: number };
	expect(Math.abs(metrics.offsetFromCenter)).toBeLessThan(2);
});

test('toolbar collapse chevron toggles without jumping sideways', async ({ page }) => {
	await expect
		.poll(async () =>
			page.evaluate(() => {
				const api = (window as Window & { __OCTANE_GRAB__?: { isActive?: () => boolean } })
					.__OCTANE_GRAB__;
				return Boolean(api?.isActive?.());
			}),
		)
		.toBe(true);

	const collapseButtonBox = async () =>
		page.evaluate(() => {
			const host = [...document.querySelectorAll('*')].find(
				(node) => node.getAttribute?.('data-react-grab') != null,
			);
			const button = host?.shadowRoot?.querySelector('[data-react-grab-toolbar-collapse]');
			const rect = button?.getBoundingClientRect();
			if (!rect) return null;
			return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
		});

	const toolbarSnapshot = async () =>
		page.evaluate(() => {
			const host = [...document.querySelectorAll('*')].find(
				(node) => node.getAttribute?.('data-react-grab') != null,
			);
			const button = host?.shadowRoot?.querySelector('[data-react-grab-toolbar-collapse]');
			const toolbar = host?.shadowRoot?.querySelector('[data-react-grab-toolbar]');
			const panel = host?.shadowRoot?.querySelector('[data-react-grab-toolbar-panel]');
			const toolbarRect = toolbar?.getBoundingClientRect();
			const panelRect = panel?.getBoundingClientRect();
			return {
				expanded: button?.getAttribute('aria-expanded'),
				label: button?.getAttribute('aria-label'),
				toolbarWidth: toolbarRect ? Math.round(toolbarRect.width) : 0,
				panelWidth: panelRect ? Math.round(panelRect.width) : 0,
			};
		});

	await expect.poll(async () => (await toolbarSnapshot())?.expanded).toBe('true');

	const first = await collapseButtonBox();
	expect(first).toBeTruthy();
	await page.mouse.click(first!.x, first!.y);

	await expect.poll(async () => (await toolbarSnapshot())?.expanded).toBe('false');
	await expect.poll(async () => (await toolbarSnapshot())?.panelWidth ?? 999).toBeLessThan(40);
	const collapsed = await toolbarSnapshot();
	expect(collapsed?.label).toBe('Expand toolbar');

	const second = await collapseButtonBox();
	expect(second).toBeTruthy();
	await page.mouse.click(second!.x, second!.y);

	await expect.poll(async () => (await toolbarSnapshot())?.expanded).toBe('true');
	await expect
		.poll(async () => (await toolbarSnapshot())?.panelWidth ?? 0)
		.toBeGreaterThan(collapsed!.panelWidth);
	const expanded = await toolbarSnapshot();
	expect(expanded?.label).toBe('Collapse toolbar');
});
