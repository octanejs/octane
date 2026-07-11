/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/jotai
 * (octane) AND real jotai (React) — the setup rewrites `@octanejs/jotai` →
 * `jotai` and `octane` → `react` for the React side. octane's
 * `mountDifferential` mounts both, drives identical clicks, and asserts
 * byte-identical innerHTML after each step. This is the gold-standard proof
 * that the binding behaves like jotai's React binding — not just "passes my
 * tests".
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const COUNTER = resolve(__dirname, '../_fixtures/counter-diff.tsrx');
const PROVIDERS = resolve(__dirname, '../_fixtures/providers-diff.tsrx');
const SPLIT = resolve(__dirname, '../_fixtures/split-diff.tsrx');
const ASYNC = resolve(__dirname, '../_fixtures/async-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves jotai from here.
const CACHE = resolve(__dirname, '.react-cache');

const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('differential: @octanejs/jotai vs real jotai on React', () => {
	it('Counter: primitive + derived + write-only setter, byte-identical', async () => {
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
		await d.step('reset', async (i, r) => {
			await i.click('#reset');
			await r.click('#reset');
		});
		d.unmount();
	});

	it('Providers: default / outer / nested-shadowing scopes, byte-identical', async () => {
		const d = await mountDifferential(PROVIDERS, 'Providers', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('bump global scope', async (i, r) => {
			await i.click('#global-inc');
			await r.click('#global-inc');
		});
		await d.step('bump outer scope', async (i, r) => {
			await i.click('#outer-inc');
			await r.click('#outer-inc');
		});
		await d.step('bump inner scope x2', async (i, r) => {
			await i.click('#inner-inc');
			await i.click('#inner-inc');
			await r.click('#inner-inc');
			await r.click('#inner-inc');
		});
		d.unmount();
	});

	it('Todos: splitAtom add/toggle/remove keyed list, byte-identical', async () => {
		const d = await mountDifferential(SPLIT, 'Todos', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('add', async (i, r) => {
			await i.click('#add');
			await r.click('#add');
		});
		await d.step('toggle item 2', async (i, r) => {
			await i.click('#t-2');
			await r.click('#t-2');
		});
		await d.step('remove item 1', async (i, r) => {
			await i.click('#rm-1');
			await r.click('#rm-1');
		});
		await d.step('toggle item 3', async (i, r) => {
			await i.click('#t-3');
			await r.click('#t-3');
		});
		d.unmount();
	});

	it('AsyncApp: pending fallback → resolved value, byte-identical at both steps', async () => {
		const d = await mountDifferential(ASYNC, 'AsyncApp', undefined, CACHE);
		await d.step('mount (pending)', async () => {
			await settle();
		});
		await d.step('resolve + settle', async (i, r) => {
			await i.click('#resolve');
			await r.click('#resolve');
			await settle();
		});
		d.unmount();
	});
});
