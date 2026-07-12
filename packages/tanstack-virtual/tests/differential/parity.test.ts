/**
 * Differential parity: the SAME `.tsrx` fixture runs through
 * @octanejs/tanstack-virtual (octane) AND real @tanstack/react-virtual
 * (React) — the setup rewrites the imports for the React side, and both
 * adapters drive the SAME @tanstack/virtual-core. octane's mountDifferential
 * mounts both, drives identical clicks, and asserts byte-identical innerHTML
 * after each step — windowing, positions, count clamps, programmatic scrolls,
 * and dynamic measurement all included.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const BASIC = resolve(__dirname, '../_fixtures/basic-list-diff.tsrx');
const HORIZONTAL = resolve(__dirname, '../_fixtures/horizontal-diff.tsrx');
const DYNAMIC = resolve(__dirname, '../_fixtures/dynamic-measure-diff.tsrx');
const WINDOW = resolve(__dirname, '../_fixtures/window-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves @tanstack/react-virtual from here.
const CACHE = resolve(__dirname, '.react-cache');

// Scroll notifies + isScrolling resets (10ms in fixtures) + the scrollToIndex
// rAF reconcile all settle inside this window.
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

describe('differential: @octanejs/tanstack-virtual vs real @tanstack/react-virtual', () => {
	it('BasicList: scroll windows + count clamp + scrollToIndex, byte-identical', async () => {
		const d = await mountDifferential(BASIC, 'BasicList', undefined, CACHE);
		await d.step('mount', async () => {
			await settle();
		});
		await d.step('scroll 100', async (i, r) => {
			await i.click('#scroll-100');
			await r.click('#scroll-100');
			await settle();
		});
		await d.step('scroll 500', async (i, r) => {
			await i.click('#scroll-500');
			await r.click('#scroll-500');
			await settle();
		});
		await d.step('count swap while scrolled (clamp parity)', async (i, r) => {
			await i.click('#count-swap');
			await r.click('#count-swap');
			await settle();
		});
		await d.step('count swap back', async (i, r) => {
			await i.click('#count-swap');
			await r.click('#count-swap');
			await settle();
		});
		await d.step('scroll 0', async (i, r) => {
			await i.click('#scroll-0');
			await r.click('#scroll-0');
			await settle();
		});
		await d.step('scrollToIndex 40', async (i, r) => {
			await i.click('#to-idx-40');
			await r.click('#to-idx-40');
			await settle(80); // rAF reconcile on both sides
		});
		d.unmount();
	});

	it('HorizontalList: scrollLeft windowing, byte-identical', async () => {
		const d = await mountDifferential(HORIZONTAL, 'HorizontalList', undefined, CACHE);
		await d.step('mount', async () => {
			await settle();
		});
		await d.step('hscroll 300', async (i, r) => {
			await i.click('#hscroll-300');
			await r.click('#hscroll-300');
			await settle();
		});
		await d.step('hscroll 0', async (i, r) => {
			await i.click('#hscroll-0');
			await r.click('#hscroll-0');
			await settle();
		});
		d.unmount();
	});

	it('DynamicList: measureElement + resizeItem + measure(), byte-identical', async () => {
		const d = await mountDifferential(DYNAMIC, 'DynamicList', undefined, CACHE);
		await d.step('mount (initial ref-measure pass)', async () => {
			await settle();
		});
		await d.step('resize item 3 → 100', async (i, r) => {
			await i.click('#resize-3');
			await r.click('#resize-3');
			await settle();
		});
		await d.step('programmatic scroll 200', async (i, r) => {
			await i.click('#scroll-200');
			await r.click('#scroll-200');
			await settle(80);
		});
		await d.step('resize item 3 back → 30', async (i, r) => {
			await i.click('#resize-3-back');
			await r.click('#resize-3-back');
			await settle();
		});
		await d.step('measure() reset', async (i, r) => {
			await i.click('#measure-all');
			await r.click('#measure-all');
			await settle();
		});
		d.unmount();
	});

	it('WindowList: window scroll windowing, byte-identical', async () => {
		const d = await mountDifferential(WINDOW, 'WindowList', undefined, CACHE);
		await d.step('mount', async () => {
			await settle();
		});
		await d.step('window scroll 500', async (i, r) => {
			await i.click('#wscroll-500');
			await r.click('#wscroll-500');
			await settle();
		});
		await d.step('window scroll 0', async (i, r) => {
			await i.click('#wscroll-0');
			await r.click('#wscroll-0');
			await settle();
		});
		d.unmount();
	});
});
