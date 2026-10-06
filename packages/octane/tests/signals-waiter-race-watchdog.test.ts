import { expect, it, vi } from 'vitest';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers.js';
import { deferred, drainProducers } from './_fixtures/signals-async-controls.js';
import { SwitchedPending } from './_fixtures/signals-waiter-public.tsrx';

it('does not repeatedly wake an async reader when a displaced pending source settles', async () => {
	const first = deferred<void>();
	const next = deferred<void>();
	const scope = createScope({ scopeKey: 'waiter' });
	const ready$ = scope.signal$('ready', false);
	const root = mount(SwitchedPending, { ready$, waiting: first.promise });
	try {
		expect(root.find('span').textContent).toBe('pending');
		await act(() => root.update(SwitchedPending, { ready$, waiting: next.promise }));

		// Bound the broken microtask retry loop without hanging the test worker.
		let retries = 0;
		const originalRace = Promise.race;
		const watchdog = vi.spyOn(Promise, 'race').mockImplementation((values) => {
			if (++retries > 100) throw new Error('A displaced pending waiter retried without settling');
			return originalRace.call(Promise, values);
		});
		try {
			await act(() => first.resolve(undefined));
			await drainProducers();
			expect(retries).toBeLessThan(100);
			expect(root.find('span').textContent).toBe('pending');
		} finally {
			watchdog.mockRestore();
		}

		await act(() => {
			ready$.set(true);
			next.resolve(undefined);
		});
		await drainProducers();
		expect(root.find('span').textContent).toBe('ready');
	} finally {
		root.unmount();
		scope.dispose();
	}
});
