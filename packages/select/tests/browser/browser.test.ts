import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';

const browserRoot = dirname(fileURLToPath(import.meta.url));

function getFreePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const server = createNetServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address() as import('node:net').AddressInfo;
			server.close(() => resolvePort(port));
		});
	});
}

let viteServer: ViteDevServer;
let browser: import('playwright').Browser;
let origin: string;

beforeAll(async () => {
	let chromium: typeof import('playwright').chromium;
	try {
		({ chromium } = await import('playwright'));
		browser = await chromium.launch({ headless: true });
	} catch (error) {
		throw new Error(
			'[@octanejs/select browser] Chromium is required ' +
				'(run `pnpm exec playwright install chromium`): ' +
				(error instanceof Error ? error.message.split('\n')[0] : String(error)),
		);
	}
	const port = await getFreePort();
	viteServer = await createServer({
		configFile: false,
		root: browserRoot,
		logLevel: 'error',
		plugins: [octane()],
		server: { host: '127.0.0.1', port, strictPort: true },
	});
	await viteServer.listen();
	origin = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
	await browser?.close().catch(() => {});
	await viteServer?.close().catch(() => {});
});

describe('Emotion-to-Octane adapter in Chromium', () => {
	it('inserts, isolates, nonces, orders, deduplicates, and adopts styles', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			const result = await page.evaluate(() =>
				(
					globalThis as typeof globalThis & {
						__reactSelectCandidate: { run(): Record<string, unknown> };
					}
				).__reactSelectCandidate.run(),
			);
			expect(result).toEqual({
				className: 'rs-181ypt',
				classesMatch: true,
				clientNonces: ['client-nonce', 'client-nonce'],
				deduped: true,
				hydratedTags: 1,
				isolatedTags: 1,
				orderedRules: true,
				serverStylePreserved: true,
				styleTagsForNestedRule: 2,
			});
		} finally {
			await page.close();
		}
	}, 60_000);
});

describe('MenuPortal in Chromium', () => {
	it('portals, positions, tracks layout changes, and cleans up', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectPortal));
			const initial = await page.evaluate(() => window.__reactSelectPortal.snapshot());
			expect(initial).toMatchObject({
				child: 'Portal child',
				id: 'menu-portal',
				parent: 'portal-target',
				position: 'absolute',
				left: '40px',
				top: '80px',
				width: '180px',
				zIndex: '1',
			});

			const moved = await page.evaluate(() => window.__reactSelectPortal.moveControl());
			expect(moved).toMatchObject({ left: '75px', top: '130px', width: '240px' });

			const fixed = await page.evaluate(() => window.__reactSelectPortal.renderFixed());
			expect(fixed).toMatchObject({
				parent: 'root',
				position: 'fixed',
				left: '75px',
				top: '130px',
				width: '240px',
			});

			const cleaned = await page.evaluate(() => window.__reactSelectPortal.unmount());
			expect(cleaned).toEqual({ portalChildren: 0, rootChildren: 0 });
		} finally {
			await page.close();
		}
	}, 30_000);
});

describe('animated components in Chromium', () => {
	it('matches React through multi-value collapse and removal', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectAnimated));
			const initial = await page.evaluate(() => ({
				octane: window.__reactSelectAnimated.snapshot('octane'),
				react: window.__reactSelectAnimated.snapshot('react'),
			}));
			expect(initial.octane.labels).toEqual(initial.react.labels);

			await page.locator('#octane-animated-root [aria-label="Remove One"]').click();
			await page.locator('#react-animated-root [aria-label="Remove One"]').click();
			await page.waitForTimeout(20);
			const exiting = await page.evaluate(() => ({
				octane: window.__reactSelectAnimated.snapshot('octane'),
				react: window.__reactSelectAnimated.snapshot('react'),
			}));
			expect(exiting.octane.width).toBe(exiting.react.width);
			expect(exiting.octane.transition).toBe(exiting.react.transition);

			await page.waitForTimeout(300);
			const exited = await page.evaluate(() => ({
				octane: window.__reactSelectAnimated.snapshot('octane'),
				react: window.__reactSelectAnimated.snapshot('react'),
			}));
			expect(exited.octane.labels).toEqual(exited.react.labels);
			expect(exited.octane.labels.join(' ')).not.toContain('One');
		} finally {
			await page.close();
		}
	}, 30_000);
});

describe('useStateManager in Chromium', () => {
	it('matches React for uncontrolled transitions, controlled precedence, and callbacks', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectStateManager));
			const initial = await page.evaluate(() => window.__reactSelectStateManager.snapshot());
			expect(initial.octane).toEqual(initial.react);

			const uncontrolled = await page.evaluate(() =>
				window.__reactSelectStateManager.exerciseUncontrolled(),
			);
			expect(uncontrolled.octane).toEqual(uncontrolled.react);
			expect(uncontrolled.octane).toMatchObject({
				consumerProp: 'preserved',
				inputValue: 'TYPED',
				menuIsOpen: true,
				value: { label: 'Next', value: 'next' },
			});
			expect(uncontrolled.logs.octane).toEqual(uncontrolled.logs.react);

			const controlled = await page.evaluate(() =>
				window.__reactSelectStateManager.exerciseControlled(),
			);
			expect(controlled.octane).toEqual(controlled.react);
			expect(controlled.octane).toMatchObject({
				inputValue: 'controlled',
				menuIsOpen: false,
				value: { label: 'Controlled', value: 'controlled' },
			});
			expect(controlled.logs.octane).toEqual(controlled.logs.react);
		} finally {
			await page.close();
		}
	}, 30_000);
});

describe('useAsync in Chromium', () => {
	it('matches React loading, cache, stale-request, resolution, and clear behavior', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectAsync));
			const initial = await page.evaluate(() => window.__reactSelectAsync.snapshot());
			expect(initial.octane).toEqual(initial.react);
			expect(initial.octane).toEqual({
				isLoading: false,
				options: [{ label: 'Default', value: 'default' }],
			});

			const loading = await page.evaluate(() => window.__reactSelectAsync.input('alpha'));
			expect(loading.octane).toEqual(loading.react);
			expect(loading.octane).toEqual({ isLoading: true, options: [] });
			expect(loading.requests.octane).toEqual(loading.requests.react);

			const resolved = await page.evaluate(() =>
				window.__reactSelectAsync.resolve('alpha', [{ label: 'Alpha', value: 'alpha' }]),
			);
			expect(resolved.octane).toEqual(resolved.react);
			expect(resolved.octane).toEqual({
				isLoading: false,
				options: [{ label: 'Alpha', value: 'alpha' }],
			});

			const cached = await page.evaluate(() => window.__reactSelectAsync.input('alpha'));
			expect(cached.octane).toEqual(cached.react);
			expect(cached.requests.octane).toEqual(['alpha']);

			await page.evaluate(() => window.__reactSelectAsync.input('beta'));
			await page.evaluate(() => window.__reactSelectAsync.input('gamma'));
			const stale = await page.evaluate(() =>
				window.__reactSelectAsync.resolve('beta', [{ label: 'Beta', value: 'beta' }]),
			);
			expect(stale.octane).toEqual(stale.react);
			expect(stale.octane).toEqual({
				isLoading: true,
				options: [{ label: 'Alpha', value: 'alpha' }],
			});
			const latest = await page.evaluate(() =>
				window.__reactSelectAsync.resolve('gamma', [{ label: 'Gamma', value: 'gamma' }]),
			);
			expect(latest.octane).toEqual(latest.react);
			expect(latest.octane.options).toEqual([{ label: 'Gamma', value: 'gamma' }]);

			const cleared = await page.evaluate(() => window.__reactSelectAsync.input(''));
			expect(cleared.octane).toEqual(cleared.react);
			expect(cleared.octane).toEqual({
				isLoading: false,
				options: [{ label: 'Default', value: 'default' }],
			});

			await page.evaluate(() => window.__reactSelectAsync.input('rejected'));
			const rejected = await page.evaluate(() => window.__reactSelectAsync.reject('rejected'));
			expect(rejected.octane).toEqual(rejected.react);
			expect(rejected.octane).toEqual({ isLoading: false, options: [] });
		} finally {
			await page.close();
		}
	}, 30_000);
});

describe('AsyncCreatable in Chromium', () => {
	it('matches React through loading, replacement, creation, and selection', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectAsyncCreatable));
			const octaneInput = page.locator('#octane-async-creatable-root [role="combobox"]');
			const reactInput = page.locator('#react-async-creatable-root [role="combobox"]');

			await octaneInput.fill('fresh');
			await reactInput.fill('fresh');
			await page.evaluate(() =>
				window.__reactSelectAsyncCreatable.resolve('fresh', [
					{ label: 'Fresh one', value: 'fresh-1' },
					{ label: 'Fresh two', value: 'fresh-2' },
				]),
			);
			await octaneInput.focus();
			await octaneInput.press('ArrowDown');
			const octaneOptions = await page
				.locator('#octane-async-creatable-root [role="option"]')
				.allTextContents();
			await reactInput.focus();
			await reactInput.press('ArrowDown');
			const reactOptions = await page
				.locator('#react-async-creatable-root [role="option"]')
				.allTextContents();
			expect(octaneOptions).toEqual(reactOptions);

			await page.evaluate(() => window.__reactSelectAsyncCreatable.renderCreation());
			await page
				.locator('#octane-async-creatable-root [role="option"]')
				.getByText('Create "brand new"', { exact: true })
				.click();
			await page
				.locator('#react-async-creatable-root [role="option"]')
				.getByText('Create "brand new"', { exact: true })
				.click();
			const changes = await page.evaluate(() => window.__reactSelectAsyncCreatable.changes());
			expect(changes.octane).toEqual(changes.react);
			expect(changes.octane.at(-1)).toMatchObject({
				actionMeta: { action: 'create-option' },
				value: { label: 'brand new', value: 'brand new' },
			});
		} finally {
			await page.close();
		}
	}, 60_000);
});

describe('full Select in Chromium', () => {
	it('exposes and executes the public imperative SelectInstance surface', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));
			const methods = await page.evaluate(() => ({
				octane: window.__reactSelectFull.instanceMethods('octane'),
				react: window.__reactSelectFull.instanceMethods('react'),
			}));
			expect(methods.octane).toEqual(methods.react);
			expect(methods.octane).toContain('clearValue');
			expect(methods.octane).toContain('selectOption');
			expect(methods.octane).toContain('setValue');

			await page.evaluate(() => {
				window.__reactSelectFull.selectThroughInstance('octane');
				window.__reactSelectFull.selectThroughInstance('react');
				window.__reactSelectFull.clearThroughInstance('octane');
				window.__reactSelectFull.clearThroughInstance('react');
				window.__reactSelectFull.setThroughInstance('octane');
				window.__reactSelectFull.setThroughInstance('react');
			});
			const logs = await page.evaluate(() => window.__reactSelectFull.logs());
			expect(logs.octane).toEqual(logs.react);
			const changes = logs.octane.filter((entry) => entry.type === 'change');
			expect(changes.slice(-3)).toMatchObject([
				{
					actionMeta: { action: 'select-option' },
					value: { label: 'Two', value: '2' },
				},
				{
					actionMeta: { action: 'clear' },
					value: null,
				},
				{
					actionMeta: { action: 'select-option' },
					value: { label: 'One', value: '1' },
				},
			]);
		} finally {
			await page.close();
		}
	}, 30_000);

	it('closes the menu when reselecting the current single-select value', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));

			async function reselect(rootId: string) {
				const combobox = page.locator(`#${rootId} [role="combobox"]`);
				await combobox.click();
				await page.locator(`#${rootId} [role="option"]`).filter({ hasText: 'One' }).click();
				await combobox.click();
				await page.locator(`#${rootId} [role="option"]`).filter({ hasText: 'One' }).click();
				return {
					menuOpen: await page.locator(`#${rootId} [role="listbox"]`).count(),
					hiddenValue: await page.locator(`#${rootId} input[name="choice"]`).inputValue(),
				};
			}

			const octane = await reselect('octane-select-root');
			const react = await reselect('react-select-root');
			expect(octane).toEqual(react);
			expect(octane.menuOpen).toBe(0);
			expect(octane.hiddenValue).toBe('1');

			const logs = await page.evaluate(() => window.__reactSelectFull.logs());
			function selectChanges(items: Array<Record<string, unknown>>) {
				return items.filter(
					(entry) =>
						entry.type === 'change' &&
						(entry.actionMeta as { action?: string } | undefined)?.action === 'select-option',
				);
			}
			expect(selectChanges(logs.octane)).toEqual(selectChanges(logs.react));
			expect(selectChanges(logs.octane)).toHaveLength(2);
		} finally {
			await page.close();
		}
	}, 30_000);

	it('keeps keyboard focus when the pointer has not moved since the key press', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));

			async function selectAfterStaleHover(rootId: string) {
				const input = page.locator(`#${rootId} [role="combobox"]`);
				await input.focus();
				await input.press('ArrowDown');
				await input.press('ArrowDown');
				await page
					.locator(`#${rootId} [role="option"]`)
					.filter({ hasText: 'One' })
					.dispatchEvent('mousemove', { bubbles: true });
				await input.press('Enter');
			}

			await selectAfterStaleHover('octane-select-root');
			await selectAfterStaleHover('react-select-root');
			const logs = await page.evaluate(() => window.__reactSelectFull.logs());
			const lastChange = (entries: Array<Record<string, unknown>>) =>
				entries.filter((entry) => entry.type === 'change').at(-1);
			expect(lastChange(logs.octane)).toEqual(lastChange(logs.react));
			expect(lastChange(logs.octane)).toMatchObject({
				value: { label: 'Two', value: '2' },
			});
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React autoFocus behavior on mount', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));
			await page.evaluate(() => window.__reactSelectFull.renderAutoFocus('octane'));
			await page.waitForFunction(() => document.activeElement?.closest('#octane-select-root'));
			const octaneRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
			await page.evaluate(() => window.__reactSelectFull.renderAutoFocus('react'));
			await page.waitForFunction(() => document.activeElement?.closest('#react-select-root'));
			const reactRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));

			expect(octaneRole).toBe(reactRole);
			expect(octaneRole).toBe('combobox');
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React required-input focus redirection', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));
			await page.evaluate(() => window.__reactSelectFull.renderRequired());

			await page.locator('#octane-select-root input[required]').focus();
			const octaneActiveRole = await page.evaluate(() =>
				document.activeElement?.getAttribute('role'),
			);
			await page.locator('#react-select-root input[required]').focus();
			const reactActiveRole = await page.evaluate(() =>
				document.activeElement?.getAttribute('role'),
			);

			expect(octaneActiveRole).toBe(reactActiveRole);
			expect(octaneActiveRole).toBe('combobox');
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React input-open and blur action sequencing', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));
			const octaneInput = page.locator('#octane-select-root [role="combobox"]');
			await octaneInput.focus();
			await octaneInput.fill('On');
			await page.locator('#octane-select-root [role="option"]').waitFor();
			await octaneInput.evaluate((input) => input.blur());
			const octaneLogs = await page.evaluate(() => window.__reactSelectFull.logs().octane);

			const reactInput = page.locator('#react-select-root [role="combobox"]');
			await reactInput.focus();
			await reactInput.fill('On');
			await page.locator('#react-select-root [role="option"]').waitFor();
			await reactInput.evaluate((input) => input.blur());
			const reactLogs = await page.evaluate(() => window.__reactSelectFull.logs().react);

			expect(octaneLogs).toEqual(reactLogs);
			expect(octaneLogs).toEqual([
				{
					type: 'input',
					value: 'On',
					actionMeta: { action: 'input-change', prevInputValue: '' },
				},
				{ type: 'open' },
				{
					type: 'input',
					value: '',
					actionMeta: { action: 'input-blur', prevInputValue: 'On' },
				},
				{
					type: 'input',
					value: '',
					actionMeta: { action: 'menu-close', prevInputValue: 'On' },
				},
				{ type: 'close' },
			]);
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React focus, menu, option selection, filtering, and keyboard behavior', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));

			const snapshot = async (rootId: string) =>
				page.evaluate((id) => {
					const root = document.getElementById(id)!;
					const visit = (node: Node): unknown => {
						if (node.nodeType === Node.TEXT_NODE) return node.textContent;
						if (!(node instanceof Element)) return null;
						if (
							node.tagName === 'STYLE' ||
							node.getAttribute('role') === 'log' ||
							node.id.endsWith('-live-region')
						)
							return null;
						const attributes = [...node.attributes]
							.map(
								(attribute) =>
									[
										attribute.name,
										attribute.value
											.replace(/css-[A-Za-z0-9_-]+/g, 'css-HASH')
											.replace(/react-select-(?:\d+|browser)/g, 'react-select-ID'),
									] as const,
							)
							.sort(([a], [b]) => a.localeCompare(b));
						return {
							tag: node.tagName.toLowerCase(),
							attributes,
							children: [...node.childNodes].map(visit).filter((value) => value !== null),
						};
					};
					return [...root.childNodes].map(visit).filter((value) => value !== null);
				}, rootId);

			const expectParity = async () => {
				expect(await snapshot('octane-select-root')).toEqual(await snapshot('react-select-root'));
			};
			const announcements = (rootId: string) =>
				page.evaluate((id) => {
					const root = document.getElementById(id)!;
					return {
						initial: root.querySelector('[id$="-live-region"]')?.textContent ?? '',
						live: root.querySelector('[role="log"]')?.textContent ?? '',
					};
				}, rootId);

			await expectParity();
			const octaneInput = page.locator('#octane-select-root [role="combobox"]');
			const reactInput = page.locator('#react-select-root [role="combobox"]');
			await octaneInput.focus();
			await octaneInput.press('ArrowDown');
			const octaneOpened = await snapshot('octane-select-root');
			const octaneOpenedAnnouncements = await announcements('octane-select-root');
			await octaneInput.dispatchEvent('compositionstart');
			await octaneInput.press('Enter');
			await octaneInput.dispatchEvent('compositionend');
			const octaneCompositionLogs = await page.evaluate(
				() => window.__reactSelectFull.logs().octane,
			);
			await octaneInput.press('PageDown');
			const octanePageDown = await snapshot('octane-select-root');
			await reactInput.focus();
			await reactInput.press('ArrowDown');
			const reactOpened = await snapshot('react-select-root');
			const reactOpenedAnnouncements = await announcements('react-select-root');
			await reactInput.dispatchEvent('compositionstart');
			await reactInput.press('Enter');
			await reactInput.dispatchEvent('compositionend');
			const reactCompositionLogs = await page.evaluate(() => window.__reactSelectFull.logs().react);
			await reactInput.press('PageDown');
			const reactPageDown = await snapshot('react-select-root');
			expect(octaneOpened).toEqual(reactOpened);
			expect(octaneOpenedAnnouncements).toEqual(reactOpenedAnnouncements);
			expect(octaneCompositionLogs.filter((item) => item.type === 'change')).toEqual(
				reactCompositionLogs.filter((item) => item.type === 'change'),
			);
			expect(octaneCompositionLogs.filter((item) => item.type === 'change')).toEqual([]);
			expect(octanePageDown).toEqual(reactPageDown);
			expect(await page.locator('#octane-select-root [role="option"]').allTextContents()).toEqual([
				// The Octane menu closed when document focus moved to React; the captured
				// structure above is the authoritative open-state comparison.
			]);

			await octaneInput.focus();
			await octaneInput.press('ArrowDown');
			await page.locator('#octane-select-root [role="option"]').nth(1).click();
			const octaneSelected = await snapshot('octane-select-root');
			const octaneSelectedAnnouncements = await announcements('octane-select-root');
			await reactInput.focus();
			await reactInput.press('ArrowDown');
			await page.locator('#react-select-root [role="option"]').nth(1).click();
			const reactSelected = await snapshot('react-select-root');
			const reactSelectedAnnouncements = await announcements('react-select-root');
			expect(octaneSelected).toEqual(reactSelected);
			expect(octaneSelectedAnnouncements).toEqual(reactSelectedAnnouncements);
			expect(await page.locator('#octane-select-root input[name="choice"]').inputValue()).toBe('2');

			await octaneInput.fill('On');
			await octaneInput.press('ArrowDown');
			const octaneFiltered = await snapshot('octane-select-root');
			const octaneFilteredAnnouncements = await announcements('octane-select-root');
			expect(await page.locator('#octane-select-root [role="option"]').allTextContents()).toEqual([
				'One',
			]);
			await reactInput.fill('On');
			await reactInput.press('ArrowDown');
			const reactFiltered = await snapshot('react-select-root');
			const reactFilteredAnnouncements = await announcements('react-select-root');
			expect(octaneFiltered).toEqual(reactFiltered);
			expect(octaneFilteredAnnouncements).toEqual(reactFilteredAnnouncements);

			const logs = await page.evaluate(() => window.__reactSelectFull.logs());
			const userActions = (items: Array<Record<string, unknown>>) =>
				items.filter((item) => {
					const action = (item.actionMeta as { action?: string } | undefined)?.action;
					return item.type === 'change' || action === 'input-change';
				});
			expect(userActions(logs.octane)).toEqual(userActions(logs.react));
		} finally {
			await page.close();
		}
	}, 60_000);
});

describe('touch Select in Chromium', () => {
	it('matches React control opening and option selection from touch gestures', async () => {
		const context = await browser.newContext({
			hasTouch: true,
			viewport: { width: 1000, height: 720 },
		});
		const page = await context.newPage();
		const tap = async (locator: import('playwright').Locator) => {
			const box = await locator.boundingBox();
			if (!box) throw new Error('touch target has no layout box');
			await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
		};
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectFull));

			const octaneInput = page.locator('#octane-select-root [role="combobox"]');
			await tap(octaneInput.locator('xpath=../../..'));
			await page.locator('#octane-select-root [role="option"]').nth(1).waitFor();
			await tap(page.locator('#octane-select-root [role="option"]').nth(1));
			const octaneValue = await page
				.locator('#octane-select-root input[name="choice"]')
				.inputValue();

			const reactInput = page.locator('#react-select-root [role="combobox"]');
			await tap(reactInput.locator('xpath=../../..'));
			await page.locator('#react-select-root [role="option"]').nth(1).waitFor();
			await tap(page.locator('#react-select-root [role="option"]').nth(1));
			const reactValue = await page.locator('#react-select-root input[name="choice"]').inputValue();

			expect(octaneValue).toBe(reactValue);
			expect(octaneValue).toBe('2');
			const logs = await page.evaluate(() => window.__reactSelectFull.logs());
			const changes = (items: Array<Record<string, unknown>>) =>
				items.filter((item) => item.type === 'change');
			expect(changes(logs.octane)).toEqual(changes(logs.react));
		} finally {
			await context.close();
		}
	}, 30_000);
});

describe('multi-value keyboard navigation in Chromium', () => {
	it('allows a selected disabled option to be deselected through the public instance', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectMulti));
			await page.evaluate(() => {
				window.__reactSelectMulti.deselectDisabledThroughInstance('octane');
				window.__reactSelectMulti.deselectDisabledThroughInstance('react');
			});

			const logs = await page.evaluate(() => window.__reactSelectMulti.logs());
			expect(logs.octane).toEqual(logs.react);
			expect(logs.octane.at(-1)).toMatchObject({
				actionMeta: { action: 'deselect-option', option: { label: 'One', value: '1' } },
				value: [{ label: 'Two', value: '2' }],
			});
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React clear-indicator behavior and focus restoration', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectMulti));
			const clear = async (rootId: string) => {
				const icons = page.locator(`#${rootId} svg`);
				const indicator = icons.nth((await icons.count()) - 2).locator('..');
				await indicator.dispatchEvent('mousedown', { button: 0 });
				await page.waitForTimeout(0);
				return page.evaluate((id) => {
					const root = document.getElementById(id)!;
					return {
						activeRole: document.activeElement?.getAttribute('role'),
						values: [...root.querySelectorAll<HTMLInputElement>('input[name="multi-choice"]')].map(
							(input) => input.value,
						),
					};
				}, rootId);
			};

			const octane = await clear('octane-multi-root');
			const react = await clear('react-multi-root');
			expect(octane).toEqual(react);
			expect(octane).toEqual({ activeRole: 'combobox', values: [''] });
			const logs = await page.evaluate(() => window.__reactSelectMulti.logs());
			expect(logs.octane).toEqual(logs.react);
			expect(logs.octane[0]).toMatchObject({
				actionMeta: { action: 'clear', name: 'multi-choice' },
			});
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React value focus and repeated Backspace removal', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectMulti));
			const snapshot = (rootId: string) =>
				page.evaluate((id) => {
					const root = document.getElementById(id)!;
					return {
						text: root.textContent,
						value: [...root.querySelectorAll<HTMLInputElement>('input[name="multi-choice"]')].map(
							(input) => input.value,
						),
						classes: [...root.querySelectorAll('[class]')].map((element) =>
							(element.getAttribute('class') ?? '').replace(/css-[A-Za-z0-9_-]+/g, 'css-HASH'),
						),
					};
				}, rootId);

			const octaneInput = page.locator('#octane-multi-root [role="combobox"]');
			await octaneInput.focus();
			await octaneInput.press('ArrowLeft');
			const octaneFocused = await snapshot('octane-multi-root');
			await octaneInput.press('Backspace');
			await octaneInput.press('Backspace');
			const octaneRemoved = await snapshot('octane-multi-root');

			const reactInput = page.locator('#react-multi-root [role="combobox"]');
			await reactInput.focus();
			await reactInput.press('ArrowLeft');
			const reactFocused = await snapshot('react-multi-root');
			await reactInput.press('Backspace');
			await reactInput.press('Backspace');
			const reactRemoved = await snapshot('react-multi-root');

			expect(octaneFocused).toEqual(reactFocused);
			expect(octaneRemoved).toEqual(reactRemoved);
			expect(octaneRemoved.value).toEqual(['']);
			const logs = await page.evaluate(() => window.__reactSelectMulti.logs());
			expect(logs.octane).toEqual(logs.react);
		} finally {
			await page.close();
		}
	}, 30_000);
});

describe('menu placement in Chromium', () => {
	it('preserves the first body snapshot across overlapping scroll locks', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(`${origin}/scroll-lock.html`, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectScrollLocks));
			for (const order of ['first-second', 'second-first'] as const) {
				const result = await page.evaluate(
					(value) => window.__reactSelectScrollLocks.run(value),
					order,
				);
				expect(result.locked).toMatchObject({
					boxSizing: 'border-box',
					height: '100%',
					overflow: 'hidden',
					position: 'relative',
				});
				expect(result.afterFirst).toEqual(result.locked);
				expect(result.afterSecond).toEqual(result.original);
			}
		} finally {
			await page.close();
		}
	}, 30_000);

	it('matches React auto-flip placement and constrained height near the viewport edge', async () => {
		const page = await browser.newPage({ viewport: { width: 1000, height: 720 } });
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectPlacement));
			await page.waitForFunction(() =>
				Boolean(window.__reactSelectPlacement.snapshot('octane-placement-root')),
			);
			const result = await page.evaluate(() => ({
				octane: window.__reactSelectPlacement.snapshot('octane-placement-root'),
				react: window.__reactSelectPlacement.snapshot('react-placement-root'),
			}));
			expect(result.octane).toEqual(result.react);
			expect(result.octane?.bottom).toBe('38px');
			const afterOctaneWheel = await page.evaluate(() =>
				window.__reactSelectPlacement.wheel('octane-placement-root'),
			);
			const afterReactWheel = await page.evaluate(() =>
				window.__reactSelectPlacement.wheel('react-placement-root'),
			);
			expect(afterOctaneWheel.body).toEqual({
				height: '100%',
				overflow: 'hidden',
				position: 'relative',
			});
			expect(afterReactWheel.logs.react).toEqual(afterReactWheel.logs.octane);
			expect(afterReactWheel.logs.react).toEqual(['bottom']);
		} finally {
			await page.close();
		}
	}, 30_000);
});

describe('NonceProvider in Chromium', () => {
	it('applies nonce-bearing isolated client caches and reacts to cache-key changes', async () => {
		const page = await browser.newPage();
		try {
			await page.goto(origin, { waitUntil: 'networkidle' });
			await page.waitForFunction(() => Boolean(window.__reactSelectNonce));
			const initial = await page.evaluate(() => window.__reactSelectNonce.snapshot());
			expect(initial.styleCount).toBeGreaterThan(0);
			expect(initial.classes.length).toBeGreaterThan(0);
			expect(initial.nonces.every((nonce) => nonce === 'browser-csp')).toBe(true);

			const switched = await page.evaluate(() => window.__reactSelectNonce.switchKey());
			expect(switched.styleCount).toBe(initial.styleCount);
			expect(switched.classes.length).toBeGreaterThan(0);
			expect(switched.nonces.every((nonce) => nonce === 'browser-csp')).toBe(true);
		} finally {
			await page.close();
		}
	}, 30_000);
});
