import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { ForUseMemoRemove } from './_fixtures/for-usememo-remove.tsrx';

function itemLabels(container: ParentNode): string[] {
	return [...container.querySelectorAll('.list .item .label')].map((el) => el.textContent ?? '');
}

function itemIds(container: ParentNode): number[] {
	return [...container.querySelectorAll('.list .item')].map((el) =>
		Number((el as HTMLElement).dataset.id),
	);
}

describe('useMemo inside keyed @for — per-row remove (#847)', () => {
	it('removing survivors in sequence does not resurrect earlier rows', () => {
		const r = mount(ForUseMemoRemove);
		expect(itemLabels(r.container)).toEqual(['apple', 'banana', 'cherry']);

		r.click('[data-remove="1"]');
		expect(itemLabels(r.container)).toEqual(['banana', 'cherry']);
		expect(itemIds(r.container)).toEqual([2, 3]);

		r.click('[data-remove="2"]');
		expect(itemLabels(r.container)).toEqual(['cherry']);
		expect(itemIds(r.container)).toEqual([3]);
		expect(r.html()).not.toContain('apple');

		r.unmount();
	});

	it('append keeps survivor labels and grows the list', () => {
		const r = mount(ForUseMemoRemove);
		r.click('#append');
		expect(itemLabels(r.container)).toEqual(['apple', 'banana', 'cherry', 'new']);
		r.unmount();
	});

	it('reverse reorders labels to match the reversed list', () => {
		const r = mount(ForUseMemoRemove);
		r.click('#reverse');
		expect(itemLabels(r.container)).toEqual(['cherry', 'banana', 'apple']);
		r.unmount();
	});
});
