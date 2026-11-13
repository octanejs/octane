import * as Effect from 'effect/Effect';
import * as Atom from 'effect/reactivity/Atom';
import * as AtomRegistry from 'effect/reactivity/AtomRegistry';
import { describe, expect, it } from 'vitest';
import { RegistryContext, scheduleTask } from '../src/RegistryContext.tsrx';

const nextScheduledTask = () => new Promise<void>((resolve) => scheduleTask(resolve));

// OCTANE DIVERGENCE[scheduler][ordinary:effect-atom-schedule-task-cancel]:
// upstream queues these tasks on React's Scheduler at LowPriority. The port
// posts host tasks with the same observable contract: later than the current
// task and its microtasks, in order, and cancellable.
describe('scheduleTask', () => {
	// @parity-case ordinary:effect-atom-schedule-task-order
	it('runs each task in a later host task, in the order they were scheduled', async () => {
		const log: string[] = [];
		scheduleTask(() => log.push('first'));
		scheduleTask(() => log.push('second'));
		await Promise.resolve();
		log.push('microtask');
		await nextScheduledTask();
		expect(log).toEqual(['microtask', 'first', 'second']);
	});

	// @parity-case ordinary:effect-atom-schedule-task-cancel
	it('skips a task cancelled before it runs', async () => {
		const log: string[] = [];
		const cancel = scheduleTask(() => log.push('cancelled'));
		scheduleTask(() => log.push('kept'));
		cancel();
		await nextScheduledTask();
		expect(log).toEqual(['kept']);
	});

	it('drives effects in the default RegistryContext registry', async ({ signal }) => {
		const registry = RegistryContext.defaultValue;
		const atom = Atom.make(Effect.promise(() => Promise.resolve('loaded')));
		const unmount = registry.mount(atom);
		try {
			const result = await Effect.runPromise(AtomRegistry.getResult(registry, atom), { signal });
			expect(result).toBe('loaded');
		} finally {
			unmount();
		}
	});
});
