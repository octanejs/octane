import { describe, expect, it, vi } from 'vitest';
import { mount, act } from './_helpers';
import {
	FragmentSuspenseTransition,
	SuspendedDerivedHistory,
} from './_fixtures/transition-fragment-suspense.tsrx';

describe.each([false, true])('derived history, reducer=%s', (reducer) => {
	it.each([false, true])(
		'discards abandoned render state, descendant suspension=%s',
		(gateInChild) => {
			const settings = { reducer, gateInChild };
			const view = mount(SuspendedDerivedHistory, {
				...settings,
				value: 'committed',
				resource: null,
			});
			try {
				view.update(SuspendedDerivedHistory, {
					...settings,
					value: 'abandoned',
					resource: new Promise<void>(() => {}),
				});
				view.update(SuspendedDerivedHistory, { ...settings, value: 'replacement', resource: null });
				expect(view.find('#derived-history').textContent).toBe('committed');
				view.update(SuspendedDerivedHistory, { ...settings, value: 'final', resource: null });
				expect(view.find('#derived-history').textContent).toBe('replacement');
			} finally {
				view.unmount();
			}
		},
	);
	it('retries derived state when the resource resolves', async () => {
		let resolve!: () => void;
		const resource = new Promise<void>((complete) => {
			resolve = complete;
		});
		const view = mount(SuspendedDerivedHistory, { reducer, value: 'committed', resource: null });
		try {
			view.update(SuspendedDerivedHistory, { reducer, value: 'replacement', resource });
			await act(() => resolve());
			expect(view.find('#derived-history').textContent).toBe('committed');
			expect(view.container.querySelector('#loading')).toBeNull();
		} finally {
			view.unmount();
		}
	});
});

it('preserves fragment siblings and a committed portal when an added boundary child suspends', async () => {
	const target = document.createElement('div');
	document.body.append(target);
	const attempted = vi.fn();
	const view = mount(FragmentSuspenseTransition, {
		target,
		promise: new Promise<void>(() => {}),
		attempted,
	});
	try {
		const start = view.find('#start');
		const cancel = view.find('#cancel');
		const portal = target.querySelector('#current-portal');
		await act(() => view.click('#start'));
		expect(attempted).toHaveBeenCalled();
		expect(view.container.querySelector('#start')).toBe(start);
		expect(view.container.querySelector('#cancel')).toBe(cancel);
		expect(target.querySelector('#current-portal')).toBe(portal);
		await act(() => view.click('#cancel'));
		expect(view.container.querySelector('#start')).toBe(start);
		expect(view.container.querySelector('#cancel')).toBe(cancel);
		expect(target.querySelector('#current-portal')).toBe(portal);
		expect(view.container.querySelector('#loading')).toBeNull();
	} finally {
		view.unmount();
		target.remove();
	}
});
