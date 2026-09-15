import { expect, it, vi } from 'vitest';
import { act, hydrateRoot } from 'octane';
import { observable, onBecomeObserved, onBecomeUnobserved, runInAction } from '@octanejs/mobx';
import { executeHydrationFixture } from '../../../octane/tests/_hydration-ssr';
import { InteractiveList } from '../_fixtures/interaction.tsrx';

// @parity-case native:mobx-server-snapshot-hydration
it('hydrates static snapshots without server subscriptions and starts live client observations', async () => {
	const items = observable([{ id: 'a', label: 'Alpha', count: 4 }]);
	let observed = false;
	const stopObserved = onBecomeObserved(items[0], 'count', () => {
		observed = true;
	});
	const stopUnobserved = onBecomeUnobserved(items[0], 'count', () => {
		observed = false;
	});
	const onRef = vi.fn();
	const props = { items, onRef };
	const { html } = await executeHydrationFixture<{ html: string }>(
		'mobx',
		'packages/mobx/tests/_fixtures/hydration-server.ts',
		'renderList',
		props,
	);
	expect(observed).toBe(false);
	expect(onRef).not.toHaveBeenCalled();
	const container = document.createElement('div');
	container.innerHTML = html;
	document.body.appendChild(container);
	const input = container.querySelector('input')!;
	const button = container.querySelector('button')!;
	expect(button.textContent).toBe('4');
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const root = hydrateRoot(container, InteractiveList, props);
	try {
		await act(() => {});
		expect(observed).toBe(true);
		expect(container.querySelector('input')).toBe(input);
		expect(container.querySelector('button')).toBe(button);
		expect(onRef).toHaveBeenCalledWith('a', input);
		await act(() =>
			runInAction(() => {
				items[0].count = 5;
			}),
		);
		expect(button.textContent).toBe('5');
		expect(errors).not.toHaveBeenCalled();
	} finally {
		root.unmount();
		container.remove();
		errors.mockRestore();
		stopObserved();
		stopUnobserved();
	}
	expect(observed).toBe(false);
	expect(onRef).toHaveBeenLastCalledWith('a', null);
});
