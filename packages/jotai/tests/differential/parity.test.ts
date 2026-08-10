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
import { act as reactAct } from 'react';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const COUNTER = resolve(__dirname, '../_fixtures/counter-diff.tsrx');
const PROVIDERS = resolve(__dirname, '../_fixtures/providers-diff.tsrx');
const SPLIT = resolve(__dirname, '../_fixtures/split-diff.tsrx');
const ASYNC = resolve(__dirname, '../_fixtures/async-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves jotai from here.
const CACHE = resolve(__dirname, '.react-cache');

/**
 * Wait for an explicit DOM condition on BOTH runtimes while draining React and
 * Octane work. Wall-clock sleeps are not an oracle for Suspense resolution.
 */
async function waitForSelectorText(
	pair: Awaited<ReturnType<typeof mountDifferential>>,
	selector: string,
	text: string,
): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt++) {
		await pair.observe('drain for resolved DOM', async function () {
			await reactAct(async function () {
				await new Promise<void>(function (resolvePromise) {
					setTimeout(resolvePromise, 0);
				});
			});
		});
		const octaneNode = pair.octane.container.querySelector(selector);
		const reactNode = pair.react.container.querySelector(selector);
		const octaneText = octaneNode == null ? null : octaneNode.textContent;
		const reactText = reactNode == null ? null : reactNode.textContent;
		if (octaneText === text && reactText === text) {
			return;
		}
	}
	throw new Error(
		`DOM condition not met for ${selector}=${JSON.stringify(text)}:\n` +
			`  octane: ${pair.octane.container.innerHTML}\n` +
			`  react: ${pair.react.container.innerHTML}`,
	);
}

describe('differential: @octanejs/jotai vs real jotai on React', function () {
	// @parity-case differential:jotai-counter
	it('Counter: primitive + derived + write-only setter, byte-identical', async function () {
		const d = await mountDifferential(COUNTER, 'Counter', undefined, CACHE);
		await d.step('mount', function () {});
		await d.step('inc', async function (i, r) {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('inc again', async function (i, r) {
			await i.click('#inc');
			await r.click('#inc');
		});
		await d.step('reset', async function (i, r) {
			await i.click('#reset');
			await r.click('#reset');
		});
		d.unmount();
	});

	// @parity-case differential:jotai-providers
	it('Providers: default / outer / nested-shadowing scopes, byte-identical', async function () {
		const d = await mountDifferential(PROVIDERS, 'Providers', undefined, CACHE);
		await d.step('mount', function () {});
		await d.step('bump global scope', async function (i, r) {
			await i.click('#global-inc');
			await r.click('#global-inc');
		});
		await d.step('bump outer scope', async function (i, r) {
			await i.click('#outer-inc');
			await r.click('#outer-inc');
		});
		await d.step('bump inner scope x2', async function (i, r) {
			await i.click('#inner-inc');
			await i.click('#inner-inc');
			await r.click('#inner-inc');
			await r.click('#inner-inc');
		});
		d.unmount();
	});

	// @parity-case differential:jotai-split-atom
	it('Todos: splitAtom add/toggle/remove keyed list, byte-identical', async function () {
		const d = await mountDifferential(SPLIT, 'Todos', undefined, CACHE);
		await d.step('mount', function () {});
		await d.step('add', async function (i, r) {
			await i.click('#add');
			await r.click('#add');
		});
		await d.step('toggle item 2', async function (i, r) {
			await i.click('#t-2');
			await r.click('#t-2');
		});
		await d.step('remove item 1', async function (i, r) {
			await i.click('#rm-1');
			await r.click('#rm-1');
		});
		await d.step('toggle item 3', async function (i, r) {
			await i.click('#t-3');
			await r.click('#t-3');
		});
		d.unmount();
	});

	// @parity-case differential:jotai-async-atom
	it('AsyncApp: pending fallback → resolved value, byte-identical at both steps', async function () {
		const d = await mountDifferential(ASYNC, 'AsyncApp', undefined, CACHE);
		await waitForSelectorText(d, '#fallback', 'loading');
		await d.step('mount (pending)', function () {});
		await d.observe('resolve async atom', async function (i, r) {
			await i.click('#resolve');
			await r.click('#resolve');
		});
		await waitForSelectorText(d, '#value', 'v=7');
		await d.step('resolve + settle', function () {});
		d.unmount();
	});
});
