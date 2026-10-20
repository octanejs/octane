import { expect, it, vi } from 'vitest';
import { act, createRoot, startTransition } from 'octane';
import { createScope } from 'octane/signals';
import { deferred } from './_fixtures/signals-async-controls.js';
import { IncompletePrimaryRollbackApp } from './_fixtures/suspense-incomplete-primary.tsrx';

it('reveals a live child after an incomplete primary retry is rolled back', async () => {
	const scope = createScope({ scopeKey: 'incomplete-primary-rollback' });
	const step$ = scope.signal$('step', 0);
	const initial = deferred<void>();
	const retry = deferred<void>();
	const outside = deferred<void>();
	const onError = vi.fn();
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container, { onCaughtError: onError, onUncaughtError: onError });
	try {
		await act(() =>
			root.render(IncompletePrimaryRollbackApp, {
				step$,
				initial: initial.promise,
				retry: retry.promise,
				outside: outside.promise,
			}),
		);
		await act(() => startTransition(() => step$.set(1)));
		expect(container.querySelector('i')?.textContent).toBe('waiting');
		await act(() => startTransition(() => step$.set(2)));
		await act(() => {
			initial.resolve();
			retry.resolve();
			outside.resolve();
		});
		expect(onError).not.toHaveBeenCalled();
		const button = container.querySelector('button');
		expect(button?.textContent).toBe('3');
		await act(() => button!.click());
		expect(button?.textContent).toBe('4');
	} finally {
		root.unmount();
		scope.dispose();
		container.remove();
	}
});
