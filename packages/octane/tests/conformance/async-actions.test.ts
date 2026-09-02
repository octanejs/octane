import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { flushSync } from '../../src/index.js';
import {
	AsyncActionEvents,
	OptimisticRebase,
	OptimisticRepeated,
} from './_fixtures/async-actions.tsrx';

function deferred<T = void>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => (resolve = res));
	return { promise, resolve };
}
async function tick() {
	await Promise.resolve();
	await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}
async function settle() {
	for (let i = 0; i < 30; i++) await Promise.resolve();
	flushSync(() => {});
	flushEffects();
}

async function microtasks() {
	for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('conformance: delegated events during async actions', () => {
	// Per ReactDOMNativeEventHeuristic-test.js:53/:285 (event update priority) and
	// ReactAsyncActions-test.js:352 (unrelated urgent updates during an async Action).
	// Their event-scheduling × pending-Action cross-product is an additional regression.
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-dom/src/__tests__/ReactDOMNativeEventHeuristic-test.js#L53
	// https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/__tests__/ReactAsyncActions-test.js#L352-L430
	it.each([
		{
			type: 'pointermove',
			discrete: false,
			transition: false,
			name: 'bubble pointermove stays responsive',
		},
		{
			type: 'mousemove',
			discrete: false,
			transition: false,
			name: 'capture mousemove stays responsive',
		},
		{ type: 'wheel', discrete: false, transition: false, name: 'wheel stays responsive' },
		{
			type: 'scroll',
			discrete: false,
			transition: false,
			name: 'non-bubbling scroll stays responsive',
		},
		{
			type: 'pointerdown',
			discrete: true,
			transition: false,
			name: 'bubble pointerdown commits without waiting for the action',
		},
		{
			type: 'click',
			discrete: true,
			transition: false,
			name: 'capture click commits without waiting for the action',
		},
		{
			type: 'pointermove',
			discrete: false,
			transition: true,
			name: 'explicit pointermove transition remains held',
		},
	])('$name while an action is pending', async ({ type, transition }) => {
		const gate = deferred();
		const r = mount(AsyncActionEvents, { gate: gate.promise, transition });
		try {
			// No act or flushSync: these updates must retain their own event priority.
			(r.find('#event-action') as HTMLButtonElement).click();
			await microtasks();
			expect(r.find('#event-pending').textContent).toBe('pending');
			// Both the Action's initial setter and its post-await setter remain held.
			expect(r.find('#event-saved').textContent).toBe('initial');

			r.find(`#event-${type}`).dispatchEvent(new Event(type, { bubbles: type !== 'scroll' }));
			// Delegated updates commit in their own microtask batch (React's
			// batchedUpdates flushes synchronously only for a pending controlled
			// restore). What must hold is that the pending Action does not hold them.
			expect(r.find('#event-count').textContent).toBe('0');
			await microtasks();
			expect(r.find('#event-count').textContent).toBe(transition ? '0' : '1');
			expect(r.find('#event-pending').textContent).toBe('pending');
			expect(r.find('#event-saved').textContent).toBe('initial');

			gate.resolve();
			await microtasks();
			expect(r.find('#event-count').textContent).toBe('1');
			expect(r.find('#event-pending').textContent).toBe('idle');
			expect(r.find('#event-saved').textContent).toBe('finished');
		} finally {
			gate.resolve();
			await microtasks();
			r.unmount();
		}
	});

	// Per ReactAsyncActions-test.js:352; also preserves Octane's automatic post-await staging.
	it('keeps a resumed action held after a stopped continuous event', async () => {
		const resume = deferred();
		const finish = deferred();
		let resumed = false;
		const r = mount(AsyncActionEvents, {
			gate: finish.promise,
			resume: resume.promise,
			onResume: () => {
				resumed = true;
			},
			transition: false,
			stopPropagation: true,
		});
		try {
			(r.find('#event-action') as HTMLButtonElement).click();
			await microtasks();
			r.find('#event-pointermove').dispatchEvent(new Event('pointermove', { bubbles: true }));
			await microtasks();
			expect(r.find('#event-count').textContent).toBe('1');

			resume.resolve();
			await microtasks();
			expect(resumed).toBe(true);
			expect(r.find('#event-saved').textContent).toBe('initial');
			expect(r.find('#event-pending').textContent).toBe('pending');
			expect(r.find('#event-count').textContent).toBe('1');

			finish.resolve();
			await microtasks();
			expect(r.find('#event-saved').textContent).toBe('finished');
			expect(r.find('#event-pending').textContent).toBe('idle');
		} finally {
			resume.resolve();
			finish.resolve();
			await microtasks();
			r.unmount();
		}
	});
});

// Ports of ReactAsyncActions-test.js useOptimistic cases. octane folds the optimistic
// queue onto the CURRENT passthrough each render, so a passthrough change mid-action
// rebases the pending update — matching React.
describe('conformance: useOptimistic rebasing (async actions)', () => {
	it('rebases the pending optimistic update on top of a passthrough that changes mid-action', async () => {
		const gate = deferred();
		let api!: { add: () => void; bumpSaved: () => void };
		const r = mount(OptimisticRebase, { gate: gate.promise, bind: (a) => (api = a) });
		flushSync(() => {});
		expect(r.find('#opt').textContent).toBe('1');
		expect(r.find('#saved').textContent).toBe('1');

		flushSync(() => api.add()); // action: addOptimistic(1) then await
		await tick();
		expect(r.find('#pending').textContent).toBe('1');
		expect(r.find('#opt').textContent).toBe('2'); // saved(1) + 1
		expect(r.find('#saved').textContent).toBe('1');

		// Out-of-band urgent update while the action is still pending.
		flushSync(() => api.bumpSaved());
		expect(r.find('#saved').textContent).toBe('2');
		expect(r.find('#opt').textContent).toBe('3'); // REBASED: saved(2) + 1
		expect(r.find('#pending').textContent).toBe('1');

		gate.resolve();
		await settle();
		// Action settled: optimistic queue cleared, optimistic === saved.
		expect(r.find('#pending').textContent).toBe('0');
		expect(r.find('#saved').textContent).toBe('3'); // bump(2) + action's +1
		expect(r.find('#opt').textContent).toBe('3');
		r.unmount();
	});

	it('folds several addOptimistic calls in one action onto the passthrough', async () => {
		const gate = deferred();
		let run!: () => void;
		const r = mount(OptimisticRepeated, { gate: gate.promise, bind: (f) => (run = f) });
		flushSync(() => {});
		expect(r.find('#opt').textContent).toBe('0');

		flushSync(() => run());
		await tick();
		expect(r.find('#opt').textContent).toBe('3'); // 0 + 1 + 1 + 1
		expect(r.find('#pending').textContent).toBe('1');

		gate.resolve();
		await settle();
		expect(r.find('#opt').textContent).toBe('3');
		expect(r.find('#saved').textContent).toBe('3');
		expect(r.find('#pending').textContent).toBe('0');
		r.unmount();
	});
});
