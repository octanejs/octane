import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, type Root } from '../src/index.js';
import { DeferredPair, DeferredProbe } from './_fixtures/deferred-value-task.tsrx';

// useDeferredValue's deferred render runs in a later host task than the urgent
// commit that spawned it (#1864). A microtask swap shared the urgent commit's
// checkpoint, so the browser could neither paint the stale value nor deliver
// the next keystroke before the expensive deferred render ran.

const RealMessageChannel = globalThis.MessageChannel;

/** Post `fn` as a host task the way a browser queues input or a test harness would. */
function postTask(fn: () => void): void {
	const channel = new RealMessageChannel();
	channel.port1.onmessage = () => {
		channel.port1.close();
		fn();
	};
	channel.port2.postMessage(null);
}

/** Yield whole host tasks until `done()` holds (bounded so a stuck swap fails). */
async function untilTasks(done: () => boolean): Promise<void> {
	for (let i = 0; i < 50 && !done(); i++) {
		await new Promise<void>((resolve) => postTask(resolve));
	}
}

async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 10; i++) await Promise.resolve();
}

let cleanup: (() => void) | null = null;

afterEach(() => {
	cleanup?.();
	cleanup = null;
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function mountProbe(): {
	root: Root;
	container: HTMLElement;
	log: string[];
	render(value: number): void;
	/** Run `fn` from inside the next commit's layout effect. */
	inNextCommit(fn: () => void): void;
} {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	const log: string[] = [];
	let onNextCommit: (() => void) | null = null;
	const onCommit = (value: number, deferred: number): void => {
		log.push(`commit ${value}/${deferred}`);
		const next = onNextCommit;
		onNextCommit = null;
		next?.();
	};
	const render = (value: number): void => root.render(DeferredProbe, { value, onCommit });
	flushSync(() => render(0));
	cleanup = () => {
		root.unmount();
		container.remove();
	};
	return {
		root,
		container,
		log,
		render,
		inNextCommit(fn) {
			onNextCommit = fn;
		},
	};
}

describe('useDeferredValue schedules its deferred render in a later task', () => {
	it('lets a task queued by the stale commit run before the deferred commit', async () => {
		const probe = mountProbe();
		expect(probe.log).toEqual(['commit 0/0']);

		// Anything the host queued behind the stale commit (input, a paint
		// callback, a test task) runs before the deferred render starts.
		probe.inNextCommit(() => postTask(() => probe.log.push('task')));
		probe.render(1);
		await untilTasks(() => probe.log.includes('commit 1/1'));

		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0', 'task', 'commit 1/1']);
		expect(probe.container.textContent).toBe('1/1');
	});

	it('coalesces urgent updates that arrive before the deferred render into one swap', async () => {
		const probe = mountProbe();

		// A keystroke delivered before the swap task retargets it: the deferred
		// value goes straight to the latest input and never renders the skipped one.
		probe.inNextCommit(() =>
			postTask(() => {
				probe.log.push('keystroke 2');
				probe.render(2);
			}),
		);
		probe.render(1);
		await untilTasks(() => probe.log.includes('commit 2/2'));

		expect(probe.log).toEqual([
			'commit 0/0',
			'commit 1/0',
			'keystroke 2',
			'commit 2/0',
			'commit 2/2',
		]);
		expect(probe.container.textContent).toBe('2/2');
	});

	it('keeps the stale value through further microtask-only checkpoints', async () => {
		const probe = mountProbe();

		probe.render(1);
		await flushMicrotasks();
		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0']);
		expect(probe.container.textContent).toBe('1/0');

		await untilTasks(() => probe.log.includes('commit 1/1'));
		expect(probe.container.textContent).toBe('1/1');
	});

	it('commits sibling deferred values together', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container);
		cleanup = () => {
			root.unmount();
			container.remove();
		};
		// Each layout effect records what the whole container shows in its commit.
		const log: string[] = [];
		const onCommit = (value: number, deferred: number): void => {
			log.push(`${value}/${deferred} sees ${container.textContent}`);
		};
		flushSync(() => root.render(DeferredPair, { value: 0, onCommit }));

		root.render(DeferredPair, { value: 1, onCommit });
		await untilTasks(() => log.filter((entry) => entry.startsWith('1/1')).length === 2);

		expect(log).toEqual([
			'0/0 sees 0/00/0',
			'0/0 sees 0/00/0',
			'1/0 sees 1/01/0',
			'1/0 sees 1/01/0',
			'1/1 sees 1/11/1',
			'1/1 sees 1/11/1',
		]);
	});

	it('drops a pending swap whose component unmounted before the task ran', async () => {
		const probe = mountProbe();
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

		probe.render(1);
		await flushMicrotasks();
		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0']);
		probe.root.unmount();
		await untilTasks(() => false);

		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0']);
		expect(probe.container.textContent).toBe('');
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
	});

	it('is drained by act() like any other scheduled work', async () => {
		const probe = mountProbe();

		flushSync(() => probe.render(1));
		expect(probe.container.textContent).toBe('1/0');
		await act(() => {});
		expect(probe.container.textContent).toBe('1/1');
		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0', 'commit 1/1']);
	});

	it('posts through scheduler.postTask when the host provides it', async () => {
		const posted: Array<() => void> = [];
		vi.stubGlobal('scheduler', {
			postTask(callback: () => void) {
				posted.push(callback);
				return Promise.resolve();
			},
		});
		const probe = mountProbe();

		probe.render(1);
		await flushMicrotasks();
		expect(posted.length).toBeGreaterThan(0);
		expect(probe.container.textContent).toBe('1/0');

		for (const task of posted.splice(0)) task();
		await flushMicrotasks();
		expect(probe.container.textContent).toBe('1/1');
		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0', 'commit 1/1']);
	});

	it('falls back to a timer on hosts without scheduler.postTask or MessageChannel', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		vi.stubGlobal('MessageChannel', undefined);
		const probe = mountProbe();

		probe.render(1);
		await flushMicrotasks();
		expect(probe.container.textContent).toBe('1/0');

		vi.advanceTimersByTime(1);
		await flushMicrotasks();
		expect(probe.container.textContent).toBe('1/1');
		expect(probe.log).toEqual(['commit 0/0', 'commit 1/0', 'commit 1/1']);
	});
});
