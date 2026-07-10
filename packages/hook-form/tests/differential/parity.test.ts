/**
 * Differential parity: the SAME `.tsrx` form fixtures run through
 * @octanejs/hook-form (octane) AND real react-hook-form (the setup rewrites the
 * import specifiers). After mount and after each step — native typing through
 * the rig's `input` driver, submits, resets, field-array ops — the rendered
 * DOM must be byte-identical, proving the octane binding delivers the same
 * validation/state/re-render semantics as the real one.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/forms.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/hook-form vs real react-hook-form', () => {
	it('register: typing → per-keystroke validation → submit → reset renders byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'RegisterForm', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('type invalid (too short)', async (i, r) => {
			await i.input('#name', 'ab');
			await r.input('#name', 'ab');
		});
		await d.step('type valid', async (i, r) => {
			await i.input('#name', 'abc');
			await r.input('#name', 'abc');
		});
		await d.step('submit with empty required email', async (i, r) => {
			await i.click('#submit');
			await r.click('#submit');
		});
		await d.step('fill email', async (i, r) => {
			await i.input('#email', 'a@b.c');
			await r.input('#email', 'a@b.c');
		});
		await d.step('submit valid', async (i, r) => {
			await i.click('#submit');
			await r.click('#submit');
		});
		await d.step('setValue with dirty+validate', async (i, r) => {
			await i.click('#set');
			await r.click('#set');
		});
		await d.step('reset', async (i, r) => {
			await i.click('#reset');
			await r.click('#reset');
		});
		d.unmount();
	});

	it('Controller: controlled typing, fieldState, reset renders byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ControllerForm', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('clear (required error)', async (i, r) => {
			await i.input('#pet', '');
			await r.input('#pet', '');
		});
		await d.step('type', async (i, r) => {
			await i.input('#pet', 'hamster');
			await r.input('#pet', 'hamster');
		});
		await d.step('reset to new defaults', async (i, r) => {
			await i.click('#reset');
			await r.click('#reset');
		});
		d.unmount();
	});

	it('useFieldArray: append/prepend/remove/swap/move/update renders byte-identical', async () => {
		const d = await mountDifferential(FIXTURE, 'ArrayForm', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('append', async (i, r) => {
			await i.click('#append');
			await r.click('#append');
		});
		await d.step('prepend', async (i, r) => {
			await i.click('#prepend');
			await r.click('#prepend');
		});
		await d.step('type into second item', async (i, r) => {
			await i.input('#item-1', 'edited');
			await r.input('#item-1', 'edited');
		});
		await d.step('swap', async (i, r) => {
			await i.click('#swap');
			await r.click('#swap');
		});
		await d.step('move', async (i, r) => {
			await i.click('#move');
			await r.click('#move');
		});
		await d.step('update', async (i, r) => {
			await i.click('#update');
			await r.click('#update');
		});
		await d.step('remove head', async (i, r) => {
			await i.click('#remove');
			await r.click('#remove');
		});
		d.unmount();
	});
});
