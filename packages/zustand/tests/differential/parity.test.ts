/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octane-ts/zustand
 * (octane) AND real zustand (React) — the setup rewrites `@octane-ts/zustand` →
 * `zustand` and `octane-ts` → `react` for the React side. octane's
 * `mountDifferential` mounts both, drives identical clicks, and asserts
 * byte-identical innerHTML after each step. This is the gold-standard proof that
 * the binding behaves like zustand's React binding — not just "passes my tests".
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const COUNTER = resolve(__dirname, '../_fixtures/counter-diff.tsrx');
const MULTISTORE = resolve(__dirname, '../_fixtures/multistore-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves zustand from here.
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octane-ts/zustand vs real zustand on React', () => {
	it('Counter: independent slices + derived selector + action, byte-identical', async () => {
		const d = await mountDifferential(COUNTER, 'Counter', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('inc', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('inc again', async (i, r) => {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('incOther', async (i, r) => {
			await i.click('#incOther');
			await r.click('#incOther');
		});
		await d.step('reset', async (i, r) => {
			await i.click('#reset');
			await r.click('#reset');
		});
		d.unmount();
	});

	it('Zoo: two independent stores in one component, byte-identical', async () => {
		const d = await mountDifferential(MULTISTORE, 'Zoo', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('addBear', async (i, r) => {
			await i.click('#addBear');
			await r.click('#addBear');
		});
		await d.step('addFish x2', async (i, r) => {
			await i.click('#addFish');
			await i.click('#addFish');
			await r.click('#addFish');
			await r.click('#addFish');
		});
		await d.step('addBear again', async (i, r) => {
			await i.click('#addBear');
			await r.click('#addBear');
		});
		d.unmount();
	});
});
