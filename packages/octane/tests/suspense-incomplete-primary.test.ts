import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { act, createRoot, startTransition } from 'octane';
import { createScope } from 'octane/signals';
import * as SignalsClient from 'octane/signals/client';
import { deferred } from './_fixtures/signals-async-controls.js';
import { IncompletePrimaryRollbackApp } from './_fixtures/suspense-incomplete-primary.tsrx';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const fixturePath = 'packages/octane/tests/_fixtures/suspense-incomplete-primary.tsrx';
const strong = loadCompiledFixtureSource<
	typeof import('./_fixtures/suspense-incomplete-primary.tsrx')
>(readFileSync(fixturePath, 'utf8'), {
	id: fixturePath,
	mode: 'client',
	compileOptions: {
		strong: true,
		dev: process.env['OCTANE_TEST_COMPILE_MODE'] !== 'prod',
		hmr: false,
	},
	runtimeModules: { 'octane/signals/client': SignalsClient },
}).IncompletePrimaryRollbackApp;

const cases = [
	['default', IncompletePrimaryRollbackApp],
	['strong', strong],
] as const;

it.each(cases)('reveals a live child after incomplete primary rollback (%s)', async (_, App) => {
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
			root.render(App, {
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
