import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../_helpers';
import { flushSync } from '../../src/index.js';
import { OptimisticRebase, OptimisticRepeated } from './_fixtures/async-actions.tsrx';

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

// Ports of ReactAsyncActions-test.js useOptimistic cases. octane folds the optimistic
// queue onto the CURRENT passthrough each render, so a passthrough change mid-action
// rebases the pending update — matching React.
describe('conformance: useOptimistic rebasing (async actions)', () => {
	it('rebases the pending optimistic update on top of a passthrough that changes mid-action', async () => {
		const gate = deferred();
		let api!: { add: () => void; bumpSaved: () => void };
		const r = mount(OptimisticRebase as any, { gate: gate.promise, bind: (a: any) => (api = a) });
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
		const r = mount(OptimisticRepeated as any, { gate: gate.promise, bind: (f: any) => (run = f) });
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
