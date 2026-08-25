import { beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from '../src/index.js';
import { mount } from './_helpers';
import { ForUseMemoRemove } from './_fixtures/for-usememo-remove.tsrx';

// No differential React oracle: @tsrx/react lowers `@for` to a loop where per-item
// hooks violate React's rules of hooks. Behavioral coverage is here only.

declare global {
	// eslint-disable-next-line no-var
	var i: number;
}

function rowButtons(container: ParentNode) {
	return [...container.querySelectorAll('.row button')].map((el) => el.textContent ?? '');
}

function listItems(container: ParentNode): HTMLElement[] {
	return [...container.querySelectorAll('ul > li')].filter(
		(el) => !el.classList.contains('empty'),
	) as HTMLElement[];
}

function itemLabels(container: ParentNode): string[] {
	return listItems(container).map((li) => {
		const button = li.querySelector('button');
		const full = li.textContent ?? '';
		return button ? full.slice(0, full.indexOf(button.textContent ?? '')).trim() : full.trim();
	});
}

function removeButtonTexts(container: ParentNode): string[] {
	return listItems(container).map((li) => li.querySelector('button')?.textContent ?? '');
}

function clickRowButton(container: ParentNode, label: string) {
	const button = [...container.querySelectorAll('.row button')].find(
		(el) => el.textContent === label,
	);
	if (!button) throw new Error(`no row button ${label}`);
	flushSync(() => {
		(button as HTMLElement).click();
	});
}

describe('useMemo inside keyed @for — playground #847 repro', () => {
	beforeEach(() => {
		globalThis.i = 1;
	});

	it('matches playground controls', () => {
		const r = mount(ForUseMemoRemove);
		expect(rowButtons(r.container)).toEqual(['Pre', 'App', 'Rev', 'Clear']);
		r.unmount();
	});

	it('removing survivors in sequence does not resurrect earlier rows', () => {
		const r = mount(ForUseMemoRemove);
		expect(itemLabels(r.container)).toEqual(['apple', 'banana', 'cherry']);
		expect(removeButtonTexts(r.container)).toEqual(['remove 1', 'remove 2', 'remove 3']);

		r.click('ul > li:nth-child(1) button');
		expect(itemLabels(r.container)).toEqual(['banana', 'cherry']);
		expect(r.html()).not.toContain('apple');

		r.click('ul > li:nth-child(1) button');
		expect(itemLabels(r.container)).toEqual(['cherry']);
		expect(r.html()).not.toContain('apple');
		expect(r.html()).not.toContain('banana');

		r.unmount();
	});

	it('survivors re-run useMemo after sibling removal (window.i counter advances)', () => {
		const r = mount(ForUseMemoRemove);
		expect(removeButtonTexts(r.container)).toEqual(['remove 1', 'remove 2', 'remove 3']);

		r.click('ul > li:nth-child(1) button');
		// Stale memo would keep "remove 2" / "remove 3"; fresh factory runs bump i to 4 and 5.
		expect(removeButtonTexts(r.container).sort()).toEqual(['remove 4', 'remove 5']);
		expect(removeButtonTexts(r.container)).not.toEqual(['remove 2', 'remove 3']);

		r.unmount();
	});

	it('prepend and append grow the list', () => {
		const r = mount(ForUseMemoRemove);
		clickRowButton(r.container, 'Pre');
		expect(itemLabels(r.container)[0]).toBe('item 4');
		clickRowButton(r.container, 'App');
		expect(itemLabels(r.container).at(-1)).toBe('item 5');
		r.unmount();
	});

	it('reverse reorders labels to match the reversed list', () => {
		const r = mount(ForUseMemoRemove);
		clickRowButton(r.container, 'Rev');
		expect(itemLabels(r.container)).toEqual(['cherry', 'banana', 'apple']);
		r.unmount();
	});

	it('clear shows the empty state', () => {
		const r = mount(ForUseMemoRemove);
		clickRowButton(r.container, 'Clear');
		expect(r.container.querySelector('li.empty')?.textContent).toContain('Emptyy');
		expect(listItems(r.container)).toHaveLength(0);
		r.unmount();
	});
});
