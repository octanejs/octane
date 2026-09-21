import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, startTransition, type Root } from '../src/index.js';
import { act, createLog } from './_helpers';
import {
	installViewTransitionMocks,
	type ViewTransitionMocks,
} from './conformance/_helpers/view-transition-mocks';
import { createStagedResource$, StagedNativeResume } from './_fixtures/native-resume-staging.tsrx';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe('native reads revealed through a staged view-transition resume', () => {
	let mocks: ViewTransitionMocks;
	let container: HTMLDivElement;
	let root: Root;
	let recoverable: unknown[];
	const handles: Array<{
		update: () => void | Promise<void>;
		ready: { promise: Promise<void>; resolve: () => void };
		finished: { promise: Promise<void>; resolve: () => void };
	}> = [];

	beforeEach(() => {
		mocks = installViewTransitionMocks();
		container = document.createElement('div');
		document.body.append(container);
		recoverable = [];
		root = createRoot(container, {
			onRecoverableError(error) {
				recoverable.push(error);
			},
		});
		handles.length = 0;
		(document as any).startViewTransition = (input: { update: () => void | Promise<void> }) => {
			const ready = deferred<void>();
			const finished = deferred<void>();
			handles.push({
				update: typeof input === 'function' ? (input as () => void) : input.update,
				ready: { promise: ready.promise, resolve: () => ready.resolve(undefined) },
				finished: { promise: finished.promise, resolve: () => finished.resolve(undefined) },
			});
			return { ready: ready.promise, finished: finished.promise, skipTransition() {} };
		};
	});

	afterEach(async () => {
		flushSync(() => root.unmount());
		for (const handle of handles) {
			handle.ready.resolve();
			handle.finished.resolve();
		}
		await act(() => {});
		container.remove();
		mocks.restore();
		vi.restoreAllMocks();
	});

	it('publishes the held native capture and keeps updating after the reveal', async () => {
		const first = deferred<string>();
		const second = deferred<string>();
		const state = createStagedResource$('staged-native-resume', (key) =>
			key === 'a' ? first.promise : second.promise,
		);
		const log = createLog();
		const uncaught: unknown[] = [];
		const onUncaught = (error: unknown) => uncaught.push(error);
		process.on('uncaughtException', onUncaught);
		try {
			await act(() => root.render(StagedNativeResume, { ...state, log: log.push }));
			await act(() => first.resolve('old'));
			const panel = container.querySelector('.panel')!;
			expect(container.querySelector('.async-value')!.textContent).toBe('old');

			const staged = handles.length;
			startTransition(() =>
				state.scope.batch(() => {
					state.scope.set(state.count$, 1);
					state.scope.set(state.key$, 'b');
				}),
			);
			await act(() => second.resolve('new'));
			// The reveal routes through VIEW_TRANSITION_DRIVER.wrapResume, so the
			// native capture's acceptance is staged rather than published inline.
			for (let index = staged; index < handles.length; index++) {
				await handles[index].update();
				handles[index].ready.resolve();
				handles[index].finished.resolve();
			}
			await act(() => {});

			expect(recoverable).toEqual([]);
			expect(log.drain()).toContain('layout:new');
			expect(container.querySelector('.panel')).toBe(panel);
			expect(container.querySelector('.async-value')!.textContent).toBe('new');
			expect(container.querySelector('.count')!.textContent).toBe('1');

			await act(() => state.scope.set(state.count$, 5));
			expect(container.querySelector('.count')!.textContent).toBe('5');
			expect(uncaught).toEqual([]);
		} finally {
			process.off('uncaughtException', onUncaught);
			first.resolve('old');
			second.resolve('new');
			flushSync(() => root.unmount());
			state.scope.dispose();
		}
	});
});
