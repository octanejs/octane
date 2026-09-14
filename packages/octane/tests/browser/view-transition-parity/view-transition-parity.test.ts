import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import type {} from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE = process.env.OCTANE_VT_BROWSER_PACKAGE ?? resolve(HERE, '../../..');
const packageRequire = createRequire(resolve(PACKAGE, 'package.json'));
let browser: Browser;
const servers = new Map<'dev' | 'prod', ViteDevServer>();
beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
	await Promise.all([...servers.values()].map((server) => server.close()));
});

async function fixtureServer(mode: 'dev' | 'prod') {
	const existing = servers.get(mode);
	if (existing) return existing;
	const server: ViteDevServer = await createServer({
		cacheDir: resolve(HERE, `../../../../../node_modules/.vite/octane-vt-parity-${mode}`),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [
			{
				name: 'view-transition-package',
				enforce: 'pre',
				resolveId(id) {
					if (id === 'octane' || id.startsWith('octane/')) return packageRequire.resolve(id);
					return null;
				},
			},
			octane(mode === 'prod' ? { hmr: false } : {}),
		],
		server: {
			host: '127.0.0.1',
			port: 0,
			fs: { allow: [resolve(HERE, '../../../../..'), PACKAGE] },
		},
	});
	try {
		await server.listen();
	} catch (error) {
		await server.close();
		throw error;
	}
	servers.set(mode, server);
	return server;
}

async function openPage(mode: 'dev' | 'prod') {
	const server = await fixtureServer(mode);
	const errors: string[] = [];
	let page: Page | undefined;
	try {
		const address = server.httpServer!.address();
		if (!address || typeof address === 'string') throw new Error('Vite has no TCP port');
		page = await browser.newPage();
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
		});
		await page.goto(`http://127.0.0.1:${address.port}/`);
		await page.waitForFunction(() => Boolean(window.__viewTransitionParity));
		return {
			page,
			errors,
			async close() {
				try {
					await page!.evaluate(() => window.__viewTransitionParity.unmount());
				} finally {
					await page!.close();
				}
			},
		};
	} catch (error) {
		await page?.close();
		throw error;
	}
}

type Update = Parameters<Window['__viewTransitionParity']['render']>[0];
async function start(page: Page, update: Update, types: string[] = [], urgent = false) {
	const mark = await page.evaluate(
		({ update, types, urgent }) => window.__viewTransitionParity.render(update, types, urgent),
		{ update, types, urgent },
	);
	await page.waitForFunction(
		(generation) => document.querySelector('#generation')?.textContent === String(generation),
		mark.generation,
		{ polling: 10 },
	);
	return mark;
}
async function transition(page: Page, update: Update, types: string[] = []) {
	const mark = await start(page, update, types);
	return page.evaluate((mark) => window.__viewTransitionParity.settle(mark), mark);
}

async function holdFont(page: Page) {
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requested!: () => void;
	const request = new Promise<void>((resolve) => {
		requested = resolve;
	});
	await page.route('**/parity-font.woff2', async (route) => {
		requested();
		await held;
		// Reuse the existing Inter fixture; no font is copied into this suite.
		await route.fulfill({
			path: resolve(
				HERE,
				'../../../../../benchmarks/tanstack-com/octane/public/fonts/Inter-latin.woff2',
			),
			contentType: 'font/woff2',
		});
	});
	await page.addStyleTag({
		content: '@font-face { font-family: ParityFont; src: url(/parity-font.woff2); }',
	});
	return { request, release };
}

describe.sequential.each(['dev', 'prod'] as const)('native View Transition parity (%s)', (mode) => {
	it('preserves focus, selection and scroll while reordering a focused survivor without moveBefore', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			const rows = [
				{ id: 'a', label: 'editable A', editable: true },
				{ id: 'b', label: 'editable B', editable: true },
				{ id: 'c', label: 'editable C', editable: true },
			];
			await start(page, { rows, styles: { overflow: 'auto' } }, [], true);
			await page.addStyleTag({ content: '[data-row] { height: 80px; margin: 0; }' });
			const focused = await page.locator('[data-row="c"]').elementHandle();
			if (!focused) throw new Error('The focused row is missing');
			const before = await focused.evaluate((element) => {
				const panel = element.parentElement!;
				Object.defineProperty(panel, 'moveBefore', { configurable: true, value: undefined });
				(element as HTMLElement).focus({ preventScroll: true });
				const range = document.createRange();
				range.setStart(element.firstChild!, 2);
				range.setEnd(element.firstChild!, 7);
				const selection = window.getSelection()!;
				selection.removeAllRanges();
				selection.addRange(range);
				panel.scrollTop = 75;
				return { selection: selection.toString(), scrollTop: panel.scrollTop };
			});
			expect(before.scrollTop).toBe(75);
			await page.evaluate(() => window.__viewTransitionParity.holdNextUpdate());
			const mark = await page.evaluate(
				(rows) => window.__viewTransitionParity.render({ rows, text: 'reordered' }),
				[rows[2]!, rows[0]!, rows[1]!],
			);
			await page.evaluate(() => window.__viewTransitionParity.waitForHeldUpdate());
			const observe = () =>
				focused.evaluate((element) => ({
					active: document.activeElement === element,
					selection: window.getSelection()!.toString(),
					scrollTop: element.parentElement!.scrollTop,
					retained: element === document.querySelector('[data-row="c"]'),
				}));
			expect(await observe()).toEqual({ ...before, active: true, retained: true });
			await page.evaluate(() => window.__viewTransitionParity.releaseHeldUpdate());
			await page.evaluate((mark) => window.__viewTransitionParity.settle(mark), mark);
			expect(await page.locator('[data-row]').allTextContents()).toEqual([
				'editable C',
				'editable A',
				'editable B',
			]);
			expect(await observe()).toEqual({ ...before, active: true, retained: true });
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('preserves later descriptor updates when a native custom-element callback refreshes the same root', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{ controls: true, text: 'initial', customValue: 'initial', descriptor: 'initial' },
				[],
				true,
			);
			await page.evaluate(() =>
				window.__viewTransitionParity.reenterOnCustomUpdate({
					text: 'urgent',
					customValue: 'urgent',
					descriptor: 'prepared',
				}),
			);
			const mark = await page.evaluate(() =>
				window.__viewTransitionParity.render({
					text: 'prepared',
					customValue: 'prepared',
					descriptor: 'prepared',
				}),
			);
			await page.waitForFunction(
				() => document.querySelector('#panel span')?.textContent === 'urgent',
				undefined,
				{ polling: 10 },
			);
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			// The callback refreshes the root before this later descriptor is written;
			// keeping its requested value equal must still publish the prepared text.
			expect(result.reentryDescriptor).toBe('initial');
			expect(await page.locator('#descriptor').textContent()).toBe('prepared');
			expect(await page.locator('#panel span').textContent()).toBe('urgent');
			expect(result.controls?.customValue).toBe('urgent');
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('finishes urgent work before a gated native update resumes without replaying stale DOM or stranding effects', async () => {
		// ReactFiberWorkLoop.flushPendingEffects stops a preparing animation and
		// flushes its pending commit before urgent work. An intermediate commit is allowed.
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{ text: 'A', descriptor: 'A', controlledValue: 'A', rows: [{ id: 'a', label: 'A' }] },
				[],
				true,
			);
			const rowA = await page.locator('[data-row="a"]').elementHandle();
			if (!rowA) throw new Error('The initial row is missing');
			await page.evaluate(() => window.__viewTransitionParity.holdNextUpdate());
			const mark = await page.evaluate(() =>
				window.__viewTransitionParity.render({
					text: 'prepared',
					descriptor: 'prepared',
					controlledValue: 'prepared',
					measure: true,
					rows: [
						{ id: 'a', label: 'prepared A' },
						{ id: 'b', label: 'prepared B' },
					],
				}),
			);
			await page.evaluate(() => window.__viewTransitionParity.waitForHeldUpdate());
			const urgent = await start(
				page,
				{
					text: 'urgent',
					descriptor: 'urgent',
					controlledValue: 'urgent',
					measure: false,
					rows: [
						{ id: 'a', label: 'urgent A' },
						{ id: 'c', label: 'urgent C' },
					],
				},
				[],
				true,
			);
			expect(await page.locator('#panel span').textContent()).toBe('urgent');
			expect(await page.locator('#controlled').inputValue()).toBe('urgent');
			await page.evaluate(() => window.__viewTransitionParity.releaseHeldUpdate());
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			expect(result.events).toEqual([]);
			expect(await page.locator('#panel span').textContent()).toBe('urgent');
			expect(await page.locator('#descriptor').textContent()).toBe('urgent');
			expect(await page.locator('#controlled').inputValue()).toBe('urgent');
			expect(await page.locator('[data-row]').allTextContents()).toEqual(['urgent A', 'urgent C']);
			expect(
				await rowA.evaluate((element) => element === document.querySelector('[data-row="a"]')),
			).toBe(true);
			await page.waitForFunction(
				(generation) =>
					window.__viewTransitionParity
						.snapshot()
						.passives.some((effect) => effect.generation === generation && effect.kind === 'mount'),
				urgent.generation,
				{ polling: 10 },
			);
			const effects = (await page.evaluate(() => window.__viewTransitionParity.snapshot()))
				.passives;
			const active = new Set<number>();
			for (const effect of effects) {
				if (effect.kind === 'mount') active.add(effect.generation);
				else active.delete(effect.generation);
			}
			expect([...active]).toEqual([urgent.generation]);
			expect(result.layouts.some((layout) => layout.generation === urgent.generation)).toBe(true);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('keeps committed DOM, properties, refs, effects and handlers visible until the native update callback', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			const initial = await start(
				page,
				{
					text: 'A',
					title: 'A',
					styles: { color: 'red' },
					controlledValue: 'A',
					descriptor: 'A',
					controls: true,
					selected: 'a',
					textareaDefault: 'A',
					customValue: 'A',
					options: [
						{ value: 'a', label: 'option A' },
						{ value: 'b', label: 'option B' },
					],
					rows: [
						{ id: 'a', label: 'row A' },
						{ id: 'b', label: 'row B' },
						{ id: 'c', label: 'row C' },
					],
				},
				[],
				true,
			);
			const rowA = await page.locator('[data-row="a"]').elementHandle();
			const rowB = await page.locator('[data-row="b"]').elementHandle();
			const rowC = await page.locator('[data-row="c"]').elementHandle();
			if (!rowA || !rowB || !rowC) throw new Error('The initial rows are missing');
			const optionB = await page.locator('option[value="b"]').elementHandle();
			const custom = await page.locator('#custom').elementHandle();
			if (!optionB || !custom) throw new Error('The initial controls are missing');
			await page.locator('#uncontrolled').fill('typed draft');
			await page.evaluate(() => window.__viewTransitionParity.holdNextUpdate());
			const mark = await page.evaluate(() =>
				window.__viewTransitionParity.render({
					text: 'B',
					title: 'B',
					styles: { color: 'blue' },
					controlledValue: 'B',
					descriptor: 'B',
					selected: 'c',
					textareaDefault: 'B',
					customValue: 'B',
					radioA: true,
					radioB: true,
					options: [
						{ value: 'b', label: 'retained option B' },
						{ value: 'c', label: 'new option C' },
					],
					measure: true,
					rows: [
						{ id: 'c', label: 'retained C' },
						{ id: 'b', label: 'retained B' },
						{ id: 'd', label: 'new D' },
					],
				}),
			);
			await page.evaluate(() => window.__viewTransitionParity.waitForHeldUpdate());
			const held = await page.evaluate(() => window.__viewTransitionParity.stagingSnapshot());
			expect(held.currentHTML).toBe(held.beforeHTML);
			expect(held.sameNodes).toBe(true);
			expect(held.currentControlledValue).toBe(held.beforeControlledValue);
			expect(held.currentControls).toEqual(held.beforeControls);
			expect(held.customEvents).toEqual([]);
			expect(held.mutations).toEqual([]);
			await page.evaluate(() => (document.querySelector('#outside') as HTMLButtonElement).click());
			const pending = await page.evaluate(() => window.__viewTransitionParity.snapshot());
			expect(pending.outsideGenerations).toEqual([initial.generation]);
			expect(pending.insertions).not.toContain(mark.generation);
			expect(pending.layouts.some((layout) => layout.generation === mark.generation)).toBe(false);
			expect(pending.passives.some((effect) => effect.generation === mark.generation)).toBe(false);
			expect(pending.measuredRefs).toEqual([]);
			await page.evaluate(() => window.__viewTransitionParity.releaseHeldUpdate());
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			expect(result.events).toMatchObject([{ kind: 'update', hasAnimation: true }]);
			expect(await page.locator('#panel span').textContent()).toBe('B');
			expect(await page.locator('#panel').getAttribute('title')).toBe('B');
			expect(await page.locator('#controlled').inputValue()).toBe('B');
			expect(await page.locator('#descriptor').textContent()).toBe('B');
			expect(result.controls).toEqual({
				selected: 'c',
				options: [
					{ value: 'b', label: 'retained option B', selected: false },
					{ value: 'c', label: 'new option C', selected: true },
				],
				textareaValue: 'typed draft',
				textareaDefault: 'B',
				customValue: 'B',
				customConnected: true,
				radios: [false, true],
			});
			expect(result.customEvents).toContain('property:B');
			expect(result.customEvents).toContain('attribute:B');
			expect(
				await optionB.evaluate(
					(element) => element === document.querySelector('option[value="b"]'),
				),
			).toBe(true);
			expect(
				await custom.evaluate((element) => element === document.querySelector('#custom')),
			).toBe(true);
			expect(await page.locator('[data-row]').allTextContents()).toEqual([
				'retained C',
				'retained B',
				'new D',
			]);
			expect(
				await rowB.evaluate((element) => element === document.querySelector('[data-row="b"]')),
			).toBe(true);
			expect(
				await rowC.evaluate((element) => element === document.querySelector('[data-row="c"]')),
			).toBe(true);
			expect(await rowA.evaluate((element) => element.isConnected)).toBe(false);
			expect(result.insertions).toContain(mark.generation);
			expect(result.layouts.some((layout) => layout.generation === mark.generation)).toBe(true);
			expect(result.measuredRefs).toEqual([true]);
			await page.evaluate(() => (document.querySelector('#outside') as HTMLButtonElement).click());
			expect(
				(await page.evaluate(() => window.__viewTransitionParity.snapshot())).outsideGenerations,
			).toEqual([initial.generation, mark.generation]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('keeps a disabled nested boundary inside its parent animation without a visible old-only animation', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{ nested: true, transition: { name: 'panel', update: 'update-class' } },
				[],
				true,
			);
			const result = await transition(page, { text: 'nested update' });
			expect(result.events).toMatchObject([{ kind: 'update', name: 'panel', hasAnimation: true }]);
			const nested = result.events[0].nested;
			if (!nested) throw new Error('The nested snapshot observation is missing');
			const visible =
				nested.oldDisplay !== 'none' &&
				nested.groupDisplay !== 'none' &&
				Number(nested.oldOpacity) > 0 &&
				Number(nested.groupOpacity) > 0;
			expect({ animations: visible ? nested.animations : [] }).toEqual({ animations: [] });
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('uses a nested boundary’s own next update prop when selecting the old capture', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{
					nested: true,
					nestedTransition: { update: 'update-class' },
					transition: { name: 'panel', update: 'update-class' },
				},
				[],
				true,
			);
			const result = await transition(page, {
				text: 'nested disabled now',
				nestedTransition: { update: 'none' },
			});
			expect(result.events).toMatchObject([{ kind: 'update', name: 'panel', hasAnimation: true }]);
			const nested = result.events[0].nested;
			if (!nested) throw new Error('The nested snapshot observation is missing');
			const visible =
				nested.oldDisplay !== 'none' &&
				nested.groupDisplay !== 'none' &&
				Number(nested.oldOpacity) > 0 &&
				Number(nested.groupOpacity) > 0;
			expect(visible ? nested.animations : []).toEqual([]);
			expect(await page.locator('#nested-panel').textContent()).toBe('nested disabled now');
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('preserves each snapshot’s name when a boundary changes its own name', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(page, { transition: { name: 'before-name', update: 'update-class' } }, [], true);
			const result = await transition(page, {
				text: 'renamed',
				transition: { name: 'after-name', update: 'update-class' },
			});
			expect(result.events).toMatchObject([
				{
					kind: 'update',
					name: 'after-name',
					oldAnimation: 'none',
					newAnimation: 'update-new',
					hasAnimation: true,
				},
			]);
			expect(result.events[0].animations).toContain('::view-transition-old(before-name)');
			expect(result.events[0].animations).toContain('::view-transition-new(after-name)');
			expect(result.calls).toMatchObject([
				{ ready: 'fulfilled', update: 'fulfilled', finished: 'fulfilled' },
			]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('waits for an already pending native navigation before exposing animation snapshots', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await page.evaluate(() => window.__viewTransitionParity.beginNavigation());
			const mark = await start(page, { text: 'navigation update' });
			// Observe a bounded interval while the real Navigation API handler remains pending.
			await page.waitForTimeout(100);
			expect(await page.evaluate(() => window.__viewTransitionParity.snapshot().events)).toEqual(
				[],
			);
			await page.evaluate(() => window.__viewTransitionParity.finishNavigation());
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			expect(result.events).toMatchObject([{ kind: 'update', hasAnimation: true }]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('waits briefly for a newly requested font before exposing animation snapshots', async () => {
		const fixture = await openPage(mode);
		const font = await holdFont(fixture.page);
		try {
			const { page, errors } = fixture;
			const mark = await start(page, {
				text: 'font update',
				styles: { fontFamily: 'ParityFont' },
				measure: true,
			});
			await font.request;
			await page.waitForTimeout(100);
			const pending = await page.evaluate(() => window.__viewTransitionParity.snapshot());
			expect(pending.events).toEqual([]);
			expect(pending.layouts.filter((layout) => layout.generation === mark.generation)).toEqual([]);
			expect(pending.measuredRefs).toEqual([]);
			font.release();
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			expect(result.events).toMatchObject([{ kind: 'update', hasAnimation: true }]);
			expect(result.layouts.filter((layout) => layout.generation === mark.generation)).toEqual([
				{ generation: mark.generation, fontLoaded: true },
			]);
			expect(result.measuredRefs).toEqual([true]);
			expect(await page.evaluate(() => document.fonts.check('16px ParityFont'))).toBe(true);
			expect(errors).toEqual([]);
		} finally {
			font.release();
			await fixture.close();
		}
	});

	it('commits urgent changes while a new font is still pending and suppresses the interrupted callback', async () => {
		const fixture = await openPage(mode);
		const font = await holdFont(fixture.page);
		try {
			const { page, errors } = fixture;
			const mark = await start(page, { text: 'font update', styles: { fontFamily: 'ParityFont' } });
			await font.request;
			await page.waitForTimeout(100);
			await start(page, { text: 'urgent', styles: { fontFamily: 'sans-serif' } }, [], true);
			expect(await page.locator('#panel span').textContent()).toBe('urgent');
			font.release();
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			expect(result.events).toEqual([]);
			expect(result.cleanups).toEqual([]);
			expect(errors).toEqual([]);
		} finally {
			font.release();
			await fixture.close();
		}
	});

	it('animates visual attribute changes without changing geometry or text', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await page.locator('#draft').fill('preserved draft');
			const result = await transition(page, { styles: { backgroundColor: 'rgb(255, 0, 0)' } });
			expect(result).toMatchObject({
				text: 'initial',
				inputIdentity: true,
				inputValue: 'preserved draft',
			});
			expect(result.events).toMatchObject([{ kind: 'update', hasAnimation: true }]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('uses update classes on both snapshots despite separately configured exit classes', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{ transition: { name: 'panel', update: 'update-class', exit: 'exit-class' } },
				[],
				true,
			);
			const result = await transition(page, { text: 'updated' });
			expect(result.events).toMatchObject([
				{ kind: 'update', oldAnimation: 'update-old', newAnimation: 'update-new' },
			]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('combines matching transition classes and exposes native CSS transition types', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{ transition: { name: 'panel', update: { next: 'first-class', detail: 'second-class' } } },
				[],
				true,
			);
			const result = await transition(page, { text: 'updated' }, ['next', 'detail']);
			expect(result.events).toMatchObject([
				{
					kind: 'update',
					types: ['next', 'detail'],
					firstType: 'yes',
					secondType: 'yes',
					nativeType: 'yes',
				},
			]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('falls back to the default class and lets any matching none suppress animation', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{ transition: { name: 'panel', default: 'fade-class', update: { next: 'first-class' } } },
				[],
				true,
			);
			const fallback = await transition(page, { text: 'fallback' }, ['other']);
			expect(fallback.events).toMatchObject([{ kind: 'update', defaultClass: 'yes' }]);
			await start(
				page,
				{
					transition: {
						name: 'panel',
						default: 'none',
						update: { next: 'first-class', quiet: 'none' },
					},
				},
				[],
				true,
			);
			const suppressed = await transition(page, { text: 'quiet' }, ['next', 'quiet']);
			expect(suppressed.text).toBe('quiet');
			expect(suppressed.events).toEqual([]);
			for (const call of suppressed.calls) expect(call.ready).toBe('rejected');
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('exposes ref and computed-style handles and cleans up when the animation finishes', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			expect(await page.evaluate(() => window.__viewTransitionParity.snapshot().refName)).toBe(
				'panel',
			);
			const result = await transition(page, {
				text: 'updated',
				transition: { name: 'panel', update: 'update-class' },
			});
			expect(result.events).toMatchObject([
				{ kind: 'update', hasComputedStyle: true, handleAnimation: 'update-new' },
			]);
			expect(result.cleanups).toEqual(['update']);
			const removed = await transition(page, { visible: false });
			expect(removed.refName).toBeNull();
			expect(removed.cleanups).toEqual(['exit']);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('restores authored names and classes after native capture', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			await start(
				page,
				{
					styles: { viewTransitionName: 'authored', viewTransitionClass: 'authored-class' },
					transition: { name: 'panel', update: 'update-class' },
				},
				[],
				true,
			);
			const result = await transition(page, { text: 'updated' });
			expect(result).toMatchObject({ name: 'authored', className: 'authored-class' });
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});

	it('keeps outside controls interactive during animation and cleans up an urgent interruption', async () => {
		const fixture = await openPage(mode);
		try {
			const { page, errors } = fixture;
			const mark = await start(page, { text: 'animated' });
			await page.waitForFunction(() => window.__viewTransitionParity.snapshot().events.length > 0);
			// Keep the native animation alive while testing actual pointer targeting.
			const paused = await page.evaluate(() => {
				const animations = document.documentElement
					.getAnimations({ subtree: true })
					.filter((animation) =>
						(animation.effect as KeyframeEffect | null)?.pseudoElement?.includes('(panel)'),
					);
				for (const animation of animations) animation.pause();
				return animations.length > 0;
			});
			expect(paused).toBe(true);
			const button = await page.locator('#outside').boundingBox();
			if (!button) throw new Error('Outside button has no rendered bounds');
			await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
			expect(
				await page.evaluate(() => window.__viewTransitionParity.snapshot().outsideClicks),
			).toBe(1);
			await start(page, { text: 'urgent' }, [], true);
			const result = await page.evaluate(
				(mark) => window.__viewTransitionParity.settle(mark),
				mark,
			);
			expect(result.text).toBe('urgent');
			expect(result.cleanups).toEqual(['update']);
			const resumed = await transition(page, { text: 'resumed' });
			expect(resumed.events).toMatchObject([{ kind: 'update', hasAnimation: true }]);
			expect(errors).toEqual([]);
		} finally {
			await fixture.close();
		}
	});
});
