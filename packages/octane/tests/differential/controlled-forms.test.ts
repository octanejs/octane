import { describe, it, expect } from 'vitest';
import { act as reactAct } from 'react';
import { mountDifferential, type DiffMount } from './_rig.js';
import { resolve } from 'node:path';

const FIX = resolve(__dirname, '../_fixtures/controlled-forms-diff.tsrx');

// ============================================================================
// Controlled form components, differential: the SAME fixture drives octane
// and @tsrx/react through identical native events. The innerHTML byte-compare
// proves the ATTRIBUTE side (React's value-attribute syncing included); the
// live `.value`/`.checked`/`.selectedIndex` asserts inside each step cover
// what innerHTML cannot see.
// ============================================================================

// Type into both sides: set the DOM value via the NATIVE prototype setter —
// React wraps `.value` with its input-value tracker, and a write through the
// wrapper is recorded as already-known, so React would treat the following
// input event as a no-change and skip its controlled restore (its own tests
// use the same untracked-setter trick). Then dispatch a native bubbling input
// event (React's root listener + octane's delegated dispatch both hear it)
// and assert the LIVE values match.
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
	const proto = el.localName === 'textarea' ? HTMLTextAreaElement : HTMLInputElement;
	Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(el, text);
}

async function typeBoth(i: DiffMount, r: DiffMount, sel: string, text: string): Promise<void> {
	const iEl = i.find(sel) as HTMLInputElement;
	setNativeValue(iEl, text);
	iEl.dispatchEvent(new Event('input', { bubbles: true }));
	const rEl = r.find(sel) as HTMLInputElement;
	await reactAct(async () => {
		setNativeValue(rEl, text);
		rEl.dispatchEvent(new Event('input', { bubbles: true }));
	});
	expect(iEl.value).toBe(rEl.value);
}

async function pickBoth(i: DiffMount, r: DiffMount, sel: string, value: string): Promise<void> {
	const iEl = i.find(sel) as HTMLSelectElement;
	iEl.value = value;
	// A real select interaction emits input immediately before change. The
	// controlled restore must leave that selection observable to native onChange.
	iEl.dispatchEvent(new Event('input', { bubbles: true }));
	iEl.dispatchEvent(new Event('change', { bubbles: true }));
	const rEl = r.find(sel) as HTMLSelectElement;
	await reactAct(async () => {
		rEl.value = value;
		rEl.dispatchEvent(new Event('input', { bubbles: true }));
		rEl.dispatchEvent(new Event('change', { bubbles: true }));
	});
	expect(iEl.value).toBe(rEl.value);
	expect(iEl.selectedIndex).toBe(rEl.selectedIndex);
}

describe('differential: controlled-forms-diff.tsrx — controlled semantics match React', () => {
	it('TypedInput: accepted typing commits and syncs the value attribute', async () => {
		const d = await mountDifferential(FIX, 'TypedInput');
		await d.step('mount', (i, r) => {
			expect((i.find('input') as HTMLInputElement).value).toBe(
				(r.find('input') as HTMLInputElement).value,
			);
		});
		await d.step('type', (i, r) => typeBoth(i, r, 'input', 'started'));
		await d.step('type again', (i, r) => typeBoth(i, r, 'input', 'startled'));
		d.unmount();
	});

	it('LockedInput: rejected typing snaps back identically', async () => {
		const d = await mountDifferential(FIX, 'LockedInput');
		await d.step('type into locked', async (i, r) => {
			await typeBoth(i, r, 'input', 'lockedX');
			expect((i.find('input') as HTMLInputElement).value).toBe('locked');
		});
		d.unmount();
	});

	it('FilterInput: filtering handler converges both DOMs', async () => {
		const d = await mountDifferential(FIX, 'FilterInput');
		await d.step('type mixed', async (i, r) => {
			await typeBoth(i, r, 'input', 'a1b2c3');
			expect((i.find('input') as HTMLInputElement).value).toBe('123');
		});
		d.unmount();
	});

	it('ToggleBox: controlled checkbox click parity', async () => {
		const d = await mountDifferential(FIX, 'ToggleBox');
		await d.step('toggle on', async (i, r) => {
			await i.click('input');
			await r.click('input');
			expect((i.find('input') as HTMLInputElement).checked).toBe(true);
			expect((r.find('input') as HTMLInputElement).checked).toBe(true);
		});
		await d.step('toggle off', async (i, r) => {
			await i.click('input');
			await r.click('input');
			expect((i.find('input') as HTMLInputElement).checked).toBe(false);
			expect((r.find('input') as HTMLInputElement).checked).toBe(false);
		});
		d.unmount();
	});

	it('Radios: controlled radio group parity', async () => {
		const d = await mountDifferential(FIX, 'Radios');
		await d.step('pick b', async (i, r) => {
			await i.click('#pb');
			await r.click('#pb');
			for (const side of [i, r]) {
				const radios = side.findAll('input') as HTMLInputElement[];
				expect(radios[1].checked).toBe(true);
				expect(radios[0].checked).toBe(false);
			}
		});
		d.unmount();
	});

	it('SelectPick: controlled select change parity', async () => {
		const d = await mountDifferential(FIX, 'SelectPick');
		await d.step('mount selection', (i, r) => {
			expect((i.find('select') as HTMLSelectElement).value).toBe('two');
			expect((r.find('select') as HTMLSelectElement).value).toBe('two');
		});
		await d.step('pick three', (i, r) => pickBoth(i, r, 'select', 'three'));
		d.unmount();
	});

	it('SelectCapturePick: capture work does not hide the pick from the bubble handler', async () => {
		const d = await mountDifferential(FIX, 'SelectCapturePick');
		await d.step('pick three', async (i, r) => {
			await pickBoth(i, r, 'select', 'three');
		});
		await d.step('both phases observed the pick', (i, r) => {
			for (const side of [i, r]) {
				expect(side.find('output').textContent).toBe('capture:three;bubble:three');
			}
		});
		d.unmount();
	});

	it('Area: controlled textarea typing parity', async () => {
		const d = await mountDifferential(FIX, 'Area');
		await d.step('type', async (i, r) => {
			await typeBoth(i, r, 'textarea', 'hello world');
			expect((i.find('textarea') as HTMLTextAreaElement).value).toBe('hello world');
		});
		d.unmount();
	});

	it('Defaulted: uncontrolled typing sticks in both', async () => {
		const d = await mountDifferential(FIX, 'Defaulted');
		await d.step('type', async (i, r) => {
			await typeBoth(i, r, 'input', 'typed');
			expect((i.find('input') as HTMLInputElement).value).toBe('typed');
		});
		d.unmount();
	});
});
