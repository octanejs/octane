import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createRoot, flushSync, startTransition } from '../src/index.js';
import {
	ActionProbe,
	HeldPendingPanel,
	OptimisticProbe,
	PendingPanel,
	StateProbe,
	TransitionInput,
	ViewTransitionPair,
} from './_fixtures/transition-flush-task.tsrx';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks';

// Transition-priority renders flush in a later host task than the urgent work
// before them (#1864, G1). A microtask flush rendered and committed once per
// ready continuation, so a backlog of 100 settled actions produced 101 commits
// in one checkpoint, and the browser could neither paint nor deliver input
// until the last one. React 19 renders the same backlog once, in a Scheduler
// task. The task posted before each burst below stands in for input or a
// paint that the host queued behind the urgent commit.

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

/** Yield whole host tasks until `done()` holds (bounded so a stuck flush fails). */
async function untilTasks(done: () => boolean): Promise<void> {
	for (let i = 0; i < 50 && !done(); i++) {
		await new Promise<void>((resolve) => postTask(resolve));
	}
}

async function flushMicrotasks(): Promise<void> {
	for (let i = 0; i < 400; i++) await Promise.resolve();
}

let cleanup: (() => void) | null = null;

afterEach(() => {
	cleanup?.();
	cleanup = null;
	vi.unstubAllGlobals();
});

function mountWith<P>(Component: (props: P) => unknown, props: P) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = createRoot(container);
	flushSync(() => root.render(Component as any, props));
	cleanup = () => {
		root.unmount();
		container.remove();
	};
	return { root, container };
}

function mountActionProbe(action: (previous: number, payload: number) => number | Promise<number>) {
	const log: string[] = [];
	let dispatch!: (payload: number) => void;
	const { root, container } = mountWith(ActionProbe, {
		action,
		expose: (next: (payload: number) => void) => (dispatch = next),
		onCommit: (entry: string) => log.push(entry),
	});
	return { root, container, log, dispatch: (payload: number) => dispatch(payload) };
}

describe('useActionState backlogs commit once, in a task', () => {
	it('renders 100 synchronous dispatches as one pending commit and one final commit', async () => {
		const probe = mountActionProbe((previous, payload) => previous + payload);

		postTask(() => probe.log.push('task'));
		for (let i = 0; i < 100; i++) probe.dispatch(1);
		await untilTasks(() => probe.log.includes('100'));

		expect(probe.log).toEqual(['0', '0P', 'task', '100']);
		expect(probe.container.textContent).toBe('100');
	});

	it('renders actions that return resolved promises once', async () => {
		const probe = mountActionProbe((previous, payload) => Promise.resolve(previous + payload));

		postTask(() => probe.log.push('task'));
		for (let i = 0; i < 100; i++) probe.dispatch(1);
		await untilTasks(() => probe.log.includes('100'));

		expect(probe.log).toEqual(['0', '0P', 'task', '100']);
		expect(probe.container.textContent).toBe('100');
	});

	it('drains a backlog behind a slow first action in one commit after it settles', async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => (open = resolve));
		const probe = mountActionProbe((previous, payload) =>
			payload === 1000 ? gate.then(() => previous + payload) : previous + payload,
		);

		probe.dispatch(1000);
		for (let i = 0; i < 100; i++) probe.dispatch(1);
		await untilTasks(() => probe.log.includes('0P'));
		await untilTasks(() => false);
		expect(probe.log).toEqual(['0', '0P']);

		postTask(() => probe.log.push('task'));
		open();
		await untilTasks(() => probe.log.includes('1100'));

		expect(probe.log).toEqual(['0', '0P', 'task', '1100']);
		expect(probe.container.textContent).toBe('1100');
	});

	it('threads previous state past a failed action and still commits once', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const probe = mountActionProbe((previous, payload) => {
			if (payload < 0) return Promise.reject(new Error('rejected'));
			return previous + payload;
		});

		postTask(() => probe.log.push('task'));
		probe.dispatch(1);
		probe.dispatch(-1);
		probe.dispatch(2);
		await untilTasks(() => probe.log.includes('3'));

		expect(probe.log).toEqual(['0', '0P', 'task', '3']);
		expect(errors).toHaveBeenCalledWith(expect.objectContaining({ message: 'rejected' }));
		errors.mockRestore();
	});

	it('drops a backlog whose component unmounted before the task ran', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const probe = mountActionProbe((previous, payload) => previous + payload);

		for (let i = 0; i < 10; i++) probe.dispatch(1);
		await flushMicrotasks();
		expect(probe.log).toEqual(['0', '0P']);
		probe.root.unmount();
		await untilTasks(() => false);

		expect(probe.log).toEqual(['0', '0P']);
		expect(probe.container.textContent).toBe('');
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
	});

	it('is drained by an awaited act()', async () => {
		const probe = mountActionProbe((previous, payload) => previous + payload);

		await act(async () => {
			for (let i = 0; i < 5; i++) probe.dispatch(1);
		});

		expect(probe.container.textContent).toBe('5');
		expect(probe.log).toEqual(['0', '0P', '5']);
	});

	it('is drained by flushSync once the actions have settled', async () => {
		const probe = mountActionProbe((previous, payload) => previous + payload);

		for (let i = 0; i < 5; i++) probe.dispatch(1);
		await flushMicrotasks();
		expect(probe.container.textContent).toBe('0P');

		flushSync(() => {});
		expect(probe.container.textContent).toBe('5');
		expect(probe.log).toEqual(['0', '0P', '5']);
	});
});

function mountStateProbe() {
	const log: string[] = [];
	let setValue!: (value: number) => void;
	const { container } = mountWith(StateProbe, {
		expose: (next: (value: number) => void) => (setValue = next),
		onCommit: (entry: string) => log.push(entry),
	});
	return { container, log, set: (value: number) => setValue(value) };
}

describe('startTransition from async code', () => {
	it('coalesces transitions started after awaits into one commit in a later task', async () => {
		const probe = mountStateProbe();

		postTask(() => probe.log.push('task'));
		for (let i = 1; i <= 100; i++) {
			await Promise.resolve();
			startTransition(() => probe.set(i));
		}
		await untilTasks(() => probe.log.includes('100'));

		expect(probe.log).toEqual(['0', 'task', '100']);
		expect(probe.container.textContent).toBe('100');
	});

	it('keeps urgent updates from async code on the microtask flush', async () => {
		const probe = mountStateProbe();

		postTask(() => probe.log.push('task'));
		await Promise.resolve();
		probe.set(1);
		await untilTasks(() => probe.log.includes('task'));

		expect(probe.log).toEqual(['0', '1', 'task']);
	});

	it('flushes a waiting transition with an urgent update to the same component', async () => {
		const probe = mountStateProbe();

		postTask(() => probe.log.push('task'));
		await Promise.resolve();
		startTransition(() => probe.set(1));
		probe.set(2);
		await untilTasks(() => probe.log.includes('task'));

		expect(probe.log).toEqual(['0', '2', 'task']);
		expect(probe.container.textContent).toBe('2');
	});

	it('is drained by flushSync with the urgent work', async () => {
		const probe = mountStateProbe();

		await Promise.resolve();
		startTransition(() => probe.set(1));
		flushSync(() => {});

		expect(probe.log).toEqual(['0', '1']);
	});

	it('is drained by a synchronous act()', () => {
		const probe = mountStateProbe();

		act(() => {
			startTransition(() => probe.set(1));
		});

		expect(probe.log).toEqual(['0', '1']);
	});
});

describe('pending cues commit before the transition they announce', () => {
	it('shows isPending in the urgent flush and the transition in a later task', async () => {
		const log: string[] = [];
		let setPanel!: (value: number) => void;
		const { container } = mountWith(PendingPanel, {
			expose: (next: (value: number) => void) => (setPanel = next),
			onCommit: (entry: string) => log.push(entry),
			onPress: (start: (fn: () => void) => void) => {
				postTask(() => log.push('task'));
				start(() => setPanel(1));
			},
		});
		log.length = 0;

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => log.includes('button idle'));

		expect(log).toEqual(['button pending', 'task', 'panel 1', 'button idle']);
		expect(container.textContent).toBe('idlepanel 1');
	});

	it('drops isPending right after an urgent update takes over the waiting transition', async () => {
		const log: string[] = [];
		let setPanel!: (value: number) => void;
		const { container } = mountWith(PendingPanel, {
			expose: (next: (value: number) => void) => (setPanel = next),
			onCommit: (entry: string) => log.push(entry),
			onPress: (start: (fn: () => void) => void) => {
				postTask(() => log.push('task'));
				start(() => setPanel(1));
				// The urgent update renders the panel now, so nothing is left for the task.
				setPanel(2);
			},
		});
		log.length = 0;

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => log.includes('task'));

		expect(log).toEqual(['button pending', 'panel 2', 'button idle', 'task']);
		expect(container.textContent).toBe('idlepanel 2');
	});

	it('keeps the previous content when the transition suspends after its cue committed', async () => {
		const log: string[] = [];
		let setPromise!: (promise: Promise<string>) => void;
		let resolve!: (value: string) => void;
		const next = new Promise<string>((done) => (resolve = done));
		const initial = Object.assign(Promise.resolve('one'), { status: 'fulfilled', value: 'one' });
		const { container } = mountWith(HeldPendingPanel, {
			initial,
			expose: (set: (promise: Promise<string>) => void) => (setPromise = set),
			onCommit: (entry: string) => log.push(entry),
			onPress: (start: (fn: () => void) => void) => start(() => setPromise(next)),
		});
		log.length = 0;

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => false);

		// The urgent flush that committed the cue ran before the transition's task;
		// the suspended transition still holds the committed screen whole.
		expect(log).toEqual(['button pending']);
		expect(container.textContent).toBe('pendingone');

		resolve('two');
		await untilTasks(() => log.includes('button idle'));
		expect(container.textContent).toBe('idletwo');
	});

	it('shows an optimistic value at once and the settled value with its clear in one commit', async () => {
		const log: string[] = [];
		let save!: (value: number, done: Promise<void>) => void;
		const { container } = mountWith(OptimisticProbe, {
			expose: (next: (value: number, done: Promise<void>) => void) => (save = next),
			onCommit: (entry: string) => log.push(entry),
		});
		let finish!: () => void;
		const done = new Promise<void>((resolve) => (finish = resolve));

		await Promise.resolve();
		save(1, done);
		await flushMicrotasks();
		expect(log).toEqual(['0/0', '0/1']);

		postTask(() => log.push('task'));
		finish();
		await untilTasks(() => log.includes('1/1'));

		expect(log).toEqual(['0/0', '0/1', 'task', '1/1']);
		expect(container.textContent).toBe('1/1');
	});
});

describe('view transitions over waiting work', () => {
	it('wraps the transition task even after an urgent update took one of its components', async () => {
		const vt = installViewTransitionMocks();
		try {
			let setA!: (value: number) => void;
			let setB!: (value: number) => void;
			const { container } = mountWith(ViewTransitionPair, {
				exposeA: (next: (value: number) => void) => (setA = next),
				exposeB: (next: (value: number) => void) => (setB = next),
			});

			await Promise.resolve();
			startTransition(() => {
				setA(1);
				setB(1);
			});
			setA(2);
			await flushMicrotasks();
			expect(container.textContent).toBe('20');
			expect(vt.calls).toHaveLength(0);

			// Only transition work is left for the task, so it is wrapped.
			await untilTasks(() => vt.calls.length > 0);
			expect(vt.calls).toHaveLength(1);
			expect(container.textContent).toBe('21');
		} finally {
			vt.restore();
		}
	});
});

describe('controlled input restores', () => {
	it('commit a transition-only input update in its event, through startViewTransition', () => {
		const vt = installViewTransitionMocks();
		try {
			const { container } = mountWith(TransitionInput, {});
			const input = container.querySelector('input') as HTMLInputElement;

			// A controlled value armed a restore, so the event commits its work
			// before restoring, the transition included, as one view transition.
			input.value = 'a';
			input.dispatchEvent(new Event('input', { bubbles: true }));

			expect(vt.calls).toHaveLength(1);
			expect(input.value).toBe('a');
			expect(container.querySelector('p')!.textContent).toBe('a');
		} finally {
			vt.restore();
		}
	});
});
