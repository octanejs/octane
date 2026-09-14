import { expect, it } from 'vitest';
import { act } from 'octane';
import { observable, onBecomeObserved, onBecomeUnobserved, runInAction } from '@octanejs/mobx';
import { mount } from '../_helpers';
import { InteractiveList } from '../_fixtures/interaction.tsrx';

// @parity-case browser:mobx-focus-refs-keyed-cleanup
it('keeps focused keyed rows reactive and releases their refs and observations', async () => {
	const items = observable([
		{ id: 'a', label: 'Alpha', count: 1 },
		{ id: 'b', label: 'Beta', count: 2 },
	]);
	const refs = new Map<string, HTMLInputElement | null>();
	const observed = new Set<string>();
	const disposers = items.flatMap((item) => [
		onBecomeObserved(item, 'count', () => observed.add(item.id)),
		onBecomeUnobserved(item, 'count', () => observed.delete(item.id)),
	]);
	const mounted = mount(InteractiveList, { items, onRef: (id, node) => refs.set(id, node) });
	try {
		const input = refs.get('a')!;
		expect(observed).toEqual(new Set(['a', 'b']));
		input.focus();
		input.value = 'Edited';
		await act(() => input.dispatchEvent(new Event('input', { bubbles: true })));
		expect(items[0].label).toBe('Edited');
		await act(() => runInAction(() => items.reverse()));
		expect([...mounted.container.querySelectorAll('li')].map((node) => node.dataset.id)).toEqual([
			'b',
			'a',
		]);
		expect(mounted.find('[aria-label="a"]')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.value).toBe('Edited');
		await act(() => (mounted.find('[data-id="a"] button') as HTMLButtonElement).click());
		expect(items[1].count).toBe(2);
		expect(mounted.find('[data-id="a"] button').textContent).toBe('2');
		mounted.unmount();
		expect(refs.get('a')).toBeNull();
		expect(refs.get('b')).toBeNull();
		expect(observed.size).toBe(0);
	} finally {
		if (mounted.container.isConnected) mounted.unmount();
		for (const dispose of disposers) dispose();
	}
});
