import * as Effect from 'effect/Effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import * as Atom from 'effect/reactivity/Atom';
import { describe, expect, it } from 'vitest';
import { RegistryContext, scheduleTask } from '../src/RegistryContext.tsrx';

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

// OCTANE DIVERGENCE[scheduler][ordinary:effect-atom-react-schedule-task-cancel]:
// upstream queues these tasks on React's Scheduler at LowPriority. The port
// posts host tasks with the same observable contract: later than the current
// task and its microtasks, in order, and cancellable.
describe('scheduleTask', () => {
	// @parity-case ordinary:effect-atom-react-schedule-task-order
	it('runs each task in a later host task, in the order they were scheduled', async () => {
		const log: string[] = [];
		scheduleTask(() => log.push('first'));
		scheduleTask(() => log.push('second'));
		await Promise.resolve();
		log.push('microtask');
		await nextTask();
		expect(log).toEqual(['microtask', 'first', 'second']);
	});

	// @parity-case ordinary:effect-atom-react-schedule-task-cancel
	it('skips a task cancelled before it runs', async () => {
		const log: string[] = [];
		const cancel = scheduleTask(() => log.push('cancelled'));
		scheduleTask(() => log.push('kept'));
		cancel();
		await nextTask();
		expect(log).toEqual(['kept']);
	});

	it('drives effects in the default RegistryContext registry', async () => {
		const registry = RegistryContext.defaultValue;
		const atom = Atom.make(Effect.promise(() => Promise.resolve('loaded')));
		const unmount = registry.mount(atom);
		try {
			await nextTask();
			expect(AsyncResult.getOrElse(registry.get(atom), () => 'pending')).toBe('loaded');
		} finally {
			unmount();
		}
	});
});
