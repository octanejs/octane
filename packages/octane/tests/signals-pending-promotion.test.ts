import { expect, it } from 'vitest';
import { act, createRoot, flushSync, startTransition } from 'octane';
import { createScope, type SignalHandle } from 'octane/signals';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';
import { capturePending$, deferred } from './_fixtures/signals-async-controls.js';
import {
	PendingPromotion,
	type PromotionResource,
} from './_fixtures/signal-pending-promotion.tsrx';

for (const tracked of [false, true]) {
	it(`refreshes an accepted pending view with ${tracked ? 'a tracked' : 'an untracked'} settled source`, async () => {
		const mocks = installViewTransitionMocks();
		const transitions: Array<{ update: () => void | Promise<void>; finish: () => void }> = [];
		(document as any).startViewTransition = (
			input: { update: () => void | Promise<void> } | (() => void),
		) => {
			let finish!: () => void;
			const completed = new Promise<void>((resolve) => {
				finish = resolve;
			});
			transitions.push({ update: typeof input === 'function' ? input : input.update, finish });
			return { ready: completed, finished: completed, skipTransition() {} };
		};
		const scope = createScope({ scopeKey: 'promotion' });
		const old = deferred<void>();
		const next = deferred<void>();
		const first: PromotionResource = {
			tracked,
			ready: false,
			ready$: scope.signal$('first', false),
			waiting: old.promise,
		};
		const second: PromotionResource = {
			tracked,
			ready: false,
			ready$: scope.signal$('second', false),
			waiting: next.promise,
		};
		let current: Pick<SignalHandle<string>, 'get' | 'snapshot'> | undefined;
		const capture = (value$: Pick<SignalHandle<string>, 'get' | 'snapshot'>) => {
			current = value$;
		};
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		try {
			await act(() => root.render(PendingPromotion, { resource: first, version: 0, capture }));
			flushSync(() => (container.querySelector('button') as HTMLButtonElement).click());
			const oldWait = capturePending$(() => current!.get());
			let oldWoke = false;
			Promise.resolve(oldWait).then(() => {
				oldWoke = true;
			});
			await act(() =>
				startTransition(() =>
					root.render(PendingPromotion, { resource: second, version: 1, capture }),
				),
			);
			expect(transitions).toHaveLength(1);
			if (tracked) second.ready$.set(true);
			else second.ready = true;
			next.resolve(undefined);
			for (let n = 0; n < 4; n++) await Promise.resolve();
			await transitions[0]!.update();
			transitions[0]!.finish();
			await act(() => {});
			expect(oldWoke).toBe(true);
			expect(container.querySelector('span')!.textContent).toBe('ready');
			expect(current!.snapshot()).toMatchObject({ status: 'ready', value: 'ready:1' });
			expect(current!.get()).toBe('ready:1');
		} finally {
			for (const transition of transitions) transition.finish();
			flushSync(() => root.unmount());
			old.resolve(undefined);
			next.resolve(undefined);
			container.remove();
			scope.dispose();
			mocks.restore();
		}
	});
}
