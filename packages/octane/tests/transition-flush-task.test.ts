import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, addTransitionType, createRoot, flushSync, startTransition } from '../src/index.js';
import {
	ActionProbe,
	ActionShell,
	type DeferredTabsControls,
	DeferredPendingTabs,
	HeldPendingPanel,
	HeldPendingTabs,
	HeldShell,
	OptimisticProbe,
	OptimisticShell,
	OptimisticTabs,
	PendingPanel,
	PendingShell,
	PendingTabs,
	PendingTabsHeldPanel,
	PendingTabsPanel,
	PendingTransitionInput,
	StateProbe,
	SuspendingCueShell,
	type TabsControls,
	TransitionInput,
	ViewTransitionPair,
	ViewTransitionShell,
	ViewTransitionTabs,
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
	// React's transition lane carries `isPending`'s falling edge with the
	// transition's own updates, so both commit together, in tree order.
	it('shows isPending in the urgent flush and drops it with the transition in a later task', async () => {
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

		expect(log).toEqual(['button pending', 'task', 'button idle', 'panel 1']);
		expect(container.textContent).toBe('idlepanel 1');
	});

	it('drops isPending in a later task when the transition updates nothing', async () => {
		const log: string[] = [];
		const { container } = mountWith(PendingPanel, {
			expose: () => {},
			onCommit: (entry: string) => log.push(entry),
			onPress: (start: (fn: () => void) => void) => {
				postTask(() => log.push('task'));
				start(() => {});
			},
		});
		log.length = 0;

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => log.includes('button idle'));

		expect(log).toEqual(['button pending', 'task', 'button idle']);
	});

	it('drops isPending in a later task after an urgent update takes over the waiting transition', async () => {
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
		await untilTasks(() => log.includes('button idle'));

		// The transition's falling edge is still transition work, so it waits for the task.
		expect(log).toEqual(['button pending', 'panel 2', 'task', 'button idle']);
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

function mountTabs(
	options: {
		onPress?: (controls: TabsControls, log: string[]) => void;
		exposePanel?: (setValue: (value: number) => void) => void;
	} = {},
) {
	const log: string[] = [];
	let controls!: TabsControls;
	const { root, container } = mountWith(
		options.exposePanel === undefined ? PendingTabs : PendingTabsPanel,
		{
			expose: (next: TabsControls) => (controls = next),
			exposePanel: options.exposePanel!,
			onCommit: (entry: string) => log.push(entry),
			onPress:
				options.onPress === undefined
					? undefined
					: (next: TabsControls) => options.onPress!(next, log),
		},
	);
	log.length = 0;
	return {
		root,
		container,
		log,
		controls: () => controls,
		click: () => (container.querySelector('button') as HTMLButtonElement).click(),
		text: () => container.querySelector('button')!.textContent,
	};
}

/** The screen at the next two host-task boundaries, where a browser could paint. */
function recordFrames(read: () => string | null | undefined): string[] {
	const frames: string[] = [];
	postTask(() => {
		frames.push(read() ?? '');
		postTask(() => frames.push(read() ?? ''));
	});
	return frames;
}

describe('a pending cue in the component that holds the transition update', () => {
	// The canonical useTransition pattern keeps `isPending` and the state the
	// transition sets in one component. React commits the pending cue with the
	// previous state, then renders the transition in a later Scheduler task, so
	// the browser can paint the cue first. The falling edge of `isPending` renders
	// with the transition's own updates, in that one render.

	it('commits the cue with the previous state and renders the transition in a later task', async () => {
		const tabs = mountTabs();
		const frames = recordFrames(tabs.text);
		postTask(() => tabs.log.push('task'));

		tabs.click();
		await untilTasks(() => frames.length === 2);

		expect(frames).toEqual(['a pending', 'b idle']);
		expect(tabs.log).toEqual(['a pending', 'task', 'b idle']);
	});

	it('also holds back the transition when it was waiting before the cue', async () => {
		const tabs = mountTabs();
		await Promise.resolve();
		const frames = recordFrames(tabs.text);

		startTransition(() => tabs.controls().setTab('b'));
		tabs.controls().start(() => {});
		await untilTasks(() => frames.length === 2);

		expect(frames).toEqual(['a pending', 'b idle']);
		expect(tabs.log[0]).toBe('a pending');
	});

	it('renders several transitions on the same state together in the task', async () => {
		const tabs = mountTabs({
			onPress: (controls) => {
				controls.start(() => controls.setTab('b'));
				controls.start(() => controls.setTab((tab) => `${tab}c`));
				controls.start(() => controls.setCount(1));
			},
		});
		const frames = recordFrames(tabs.text);

		tabs.click();
		await untilTasks(() => frames.length === 2);

		expect(frames).toEqual(['a pending', 'bc1 idle']);
		expect(tabs.log[0]).toBe('a pending');
		expect(tabs.log.slice(1).every((entry) => entry.startsWith('bc1 '))).toBe(true);
	});

	it('renders a sibling that shares the transition in the same task', async () => {
		let setPanel!: (value: number) => void;
		const tabs = mountTabs({
			exposePanel: (next) => (setPanel = next),
			onPress: (controls, log) => {
				postTask(() => log.push('task'));
				controls.start(() => {
					controls.setTab('b');
					setPanel(1);
				});
			},
		});

		tabs.click();
		await untilTasks(() => tabs.log.includes('b idle'));

		expect(tabs.log).toEqual(['a pending', 'task', 'b idle', 'panel 1']);
		expect(tabs.container.textContent).toBe('b idlepanel 1');
	});

	it('rebases an urgent update that arrives while the transition waits', async () => {
		const tabs = mountTabs();
		postTask(() => tabs.log.push('task'));

		tabs.click();
		await flushMicrotasks();
		expect(tabs.log).toEqual(['a pending']);

		// The urgent update renders the waiting transition with it, applying the
		// transition's update first, as React's rebasing does.
		tabs.controls().setTab((tab) => `${tab}!`);
		await untilTasks(() => tabs.log.includes('b! idle'));

		// isPending still falls with the transition lane, in the task.
		expect(tabs.log).toEqual(['a pending', 'b! pending', 'task', 'b! idle']);
		expect(tabs.text()).toBe('b! idle');
	});

	it('keeps a transition-committed value in a later cue', async () => {
		let setPanel!: (value: number) => void;
		const tabs = mountTabs({ exposePanel: (next) => (setPanel = next) });
		await Promise.resolve();

		// The sibling keeps the first transition waiting while an urgent update
		// takes this component's share of it.
		startTransition(() => {
			tabs.controls().setTab('b');
			setPanel(1);
		});
		tabs.controls().setCount(1);
		await flushMicrotasks();
		expect(tabs.text()).toBe('b1 idle');

		tabs.log.length = 0;
		tabs.controls().start(() => tabs.controls().setCount(2));
		await untilTasks(() => tabs.log.includes('b2 idle'));

		// The cue shows the urgent render's committed tab, not the value before it.
		expect(tabs.log[0]).toBe('b1 pending');
		expect(tabs.container.textContent).toBe('b2 idlepanel 1');
	});

	it('keeps a committed deferred value in a later cue', async () => {
		const log: string[] = [];
		let controls!: DeferredTabsControls;
		let setPanel!: (value: number) => void;
		mountWith(DeferredPendingTabs, {
			expose: (next: DeferredTabsControls) => (controls = next),
			exposePanel: (next: (value: number) => void) => (setPanel = next),
			onCommit: (entry: string) => log.push(entry),
		});
		await Promise.resolve();

		controls.setQuery('b');
		await flushMicrotasks();
		// The deferred swap's task is posted; this task follows it, and the
		// sibling's transition task follows this one, so it still waits after the swap.
		postTask(() => {
			log.length = 0;
			controls.start(() => controls.setTab('y'));
		});
		startTransition(() => setPanel(1));
		await untilTasks(() => log.includes('b/b/y idle'));

		// The cue shows the deferred value the swap committed, not the one before it.
		expect(log[0]).toBe('b/b/x pending');
		expect(log.at(-1)).toBe('b/b/y idle');
	});

	it('keeps the previous content when the transition suspends after its cue', async () => {
		const log: string[] = [];
		let resolve!: (value: string) => void;
		const next = new Promise<string>((done) => (resolve = done));
		const initial = Object.assign(Promise.resolve('one'), { status: 'fulfilled', value: 'one' });
		const { container } = mountWith(HeldPendingTabs, {
			initial,
			next,
			expose: () => {},
			onCommit: (entry: string) => log.push(entry),
		});
		const frames = recordFrames(() => container.textContent);

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => frames.length === 2);

		expect(frames).toEqual(['pendingone', 'pendingone']);

		resolve('two');
		await untilTasks(() => container.textContent === 'idletwo');
		expect(container.textContent).toBe('idletwo');
		expect(log).not.toContain('loading');
	});

	it('keeps isPending raised while a sibling boundary holds the transition', async () => {
		const log: string[] = [];
		let setPromise!: (promise: Promise<string>) => void;
		let resolve!: (value: string) => void;
		const next = new Promise<string>((done) => (resolve = done));
		const initial = Object.assign(Promise.resolve('one'), { status: 'fulfilled', value: 'one' });
		const { container } = mountWith(PendingTabsHeldPanel, {
			initial,
			exposePanel: (set: (promise: Promise<string>) => void) => (setPromise = set),
			onCommit: (entry: string) => log.push(entry),
			onPress: (controls: TabsControls) =>
				controls.start(() => {
					controls.setTab('b');
					setPromise(next);
				}),
		});
		log.length = 0;
		const button = container.querySelector('button') as HTMLButtonElement;

		button.click();
		await untilTasks(() => false);

		// OCTANE DIVERGENCE: the hold is per boundary, so the tab outside it commits
		// (SUSPENSE_DIVERGENCE.md #4). The falling edge rendered with it must not.
		expect(button.textContent).toMatch(/ pending$/);
		expect(log.every((entry) => entry.endsWith(' pending'))).toBe(true);
		expect(container.querySelector('p')!.textContent).toBe('one');

		resolve('two');
		await untilTasks(() => button.textContent === 'b idle');
		expect(container.querySelector('p')!.textContent).toBe('two');
		expect(log.at(-1)).toBe('b idle');
	});

	it('shows an optimistic value with the previous state, then the transition and its revert in a task', async () => {
		const log: string[] = [];
		const { container } = mountWith(OptimisticTabs, {
			onCommit: (entry: string) => log.push(entry),
		});
		log.length = 0;
		const frames = recordFrames(() => container.textContent);
		postTask(() => log.push('task'));

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => frames.length === 2);

		expect(frames).toEqual(['0/1', '1/1']);
		// The optimistic value reverts in the commit of the transition that settles it.
		expect(log).toEqual(['0/1', 'task', '1/1']);
	});

	it('keeps an async Action staged until it settles', async () => {
		let open!: () => void;
		const gate = new Promise<void>((done) => (open = done));
		const tabs = mountTabs({
			onPress: (controls) =>
				controls.start(async () => {
					controls.setTab('b');
					await gate;
				}),
		});

		tabs.click();
		await untilTasks(() => false);
		expect(tabs.log).toEqual(['a pending']);

		postTask(() => tabs.log.push('task'));
		open();
		await untilTasks(() => tabs.log.includes('b idle'));
		expect(tabs.log).toEqual(['a pending', 'task', 'b idle']);
	});

	it('is drained by flushSync together with its cue', async () => {
		const tabs = mountTabs();

		tabs.click();
		flushSync(() => {});
		expect(tabs.text()).toBe('b pending');

		// The cue commits before its falling edge, which takes a later task.
		await untilTasks(() => tabs.text() === 'b idle');
		expect(tabs.log.at(-1)).toBe('b idle');
	});

	it('is drained by an awaited act()', async () => {
		const tabs = mountTabs();

		await act(async () => tabs.click());

		expect(tabs.text()).toBe('b idle');
		expect(tabs.log.at(-1)).toBe('b idle');
	});

	it('drops the waiting transition when the component unmounts before its task', async () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const tabs = mountTabs();

		tabs.click();
		await flushMicrotasks();
		expect(tabs.log).toEqual(['a pending']);
		tabs.root.unmount();
		await untilTasks(() => false);

		expect(tabs.log).toEqual(['a pending']);
		expect(tabs.container.textContent).toBe('');
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
	});

	it('animates only the transition, with its types, in a view transition', async () => {
		const vt = installViewTransitionMocks();
		try {
			const types: string[][] = [];
			const { container } = mountWith(ViewTransitionTabs, {
				onUpdate: (next: string[]) => types.push(next),
			});

			(container.querySelector('button') as HTMLButtonElement).click();
			await flushMicrotasks();
			expect(container.textContent).toBe('pendinga');
			expect(vt.calls).toHaveLength(0);

			await untilTasks(() => container.textContent === 'idlebbbb');
			expect(vt.calls).toHaveLength(1);
			expect(types).toEqual([['tabs']]);
		} finally {
			vt.restore();
		}
	});

	it('commits a controlled input edit and its transition in the input event', () => {
		const { container } = mountWith(PendingTransitionInput, {});
		const input = container.querySelector('input') as HTMLInputElement;

		input.value = 'x';
		input.dispatchEvent(new Event('input', { bubbles: true }));

		expect(input.value).toBe('x');
		expect(container.querySelector('p')!.textContent).toBe('x pending');
	});
});

describe('a pending cue in an ancestor of the transition update', () => {
	// The cue's re-render reaches the component that holds the transition's
	// state. React renders the cue in an urgent lane, where that component shows
	// its committed state, and renders the transition in a later task.

	it("commits the cue with the child's previous state and renders the transition in a later task", async () => {
		const log: string[] = [];
		const { container } = mountWith(PendingShell, {
			onCommit: (entry: string) => log.push(entry),
		});
		log.length = 0;
		const frames = recordFrames(() => container.textContent);
		postTask(() => log.push('task'));

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => frames.length === 2);

		expect(frames).toEqual(['a pending', 'b idle']);
		expect(log).toEqual(['a pending', 'task', 'b idle']);
	});

	it("shows the cue while the child's transition suspends", async () => {
		const log: string[] = [];
		let setPromise!: (promise: Promise<string>) => void;
		let resolve!: (value: string) => void;
		const next = new Promise<string>((done) => (resolve = done));
		const initial = Object.assign(Promise.resolve('one'), { status: 'fulfilled', value: 'one' });
		const { container } = mountWith(HeldShell, {
			initial,
			expose: (set: (promise: Promise<string>) => void) => (setPromise = set),
			onCommit: (entry: string) => log.push(entry),
			onPress: (start: (fn: () => void) => void) => start(() => setPromise(next)),
		});
		log.length = 0;

		(container.querySelector('button') as HTMLButtonElement).click();
		await untilTasks(() => false);

		expect(log).toEqual(['pending']);
		expect(container.textContent).toBe('pendingone');

		resolve('two');
		await untilTasks(() => log.includes('idle'));
		expect(container.textContent).toBe('idletwo');
	});

	for (const [name, Shell, cued, settled] of [
		['an optimistic value', OptimisticShell, 'a saving', 'b saved'],
		["useActionState's isPending", ActionShell, 'a 0 pending', 'b 1'],
	] as const) {
		it(`commits ${name} with the child's previous state`, async () => {
			const log: string[] = [];
			let setFilter!: (filter: string) => void;
			const { container } = mountWith(Shell, {
				expose: (set: (filter: string) => void) => (setFilter = set),
				onCommit: (entry: string) => log.push(entry),
				onPress: (cue: () => void) =>
					startTransition(() => {
						cue();
						setFilter('b');
					}),
			});
			log.length = 0;
			const frames = recordFrames(() => container.querySelector('p')!.textContent);

			(container.querySelector('button') as HTMLButtonElement).click();
			await untilTasks(() => frames.length === 2);

			expect(frames[0]).toBe(cued);
			expect(log[0]).toBe(cued);
			await untilTasks(() => container.querySelector('p')!.textContent === settled);
			expect(container.querySelector('p')!.textContent).toBe(settled);
		});
	}

	it("animates only the child's transition, with its types, in a view transition", async () => {
		const vt = installViewTransitionMocks();
		try {
			const types: string[][] = [];
			let setTab!: (tab: string) => void;
			const { container } = mountWith(ViewTransitionShell, {
				expose: (set: (tab: string) => void) => (setTab = set),
				onPress: (start: (fn: () => void) => void) =>
					start(() => {
						addTransitionType('tabs');
						setTab('bbbb');
					}),
				onUpdate: (next: string[]) => types.push(next),
			});

			(container.querySelector('button') as HTMLButtonElement).click();
			await flushMicrotasks();
			expect(container.textContent).toBe('gopendinga');
			expect(vt.calls).toHaveLength(0);

			await untilTasks(() => container.textContent === 'goidlebbbb');
			expect(vt.calls).toHaveLength(1);
			expect(types).toEqual([['tabs']]);
		} finally {
			vt.restore();
		}
	});
});

describe('a pending cue renders at urgent priority', () => {
	// React commits `isPending` and optimistic values in an urgent lane, apart
	// from the transition they announce, even when no transition work is queued
	// yet (an async Action before its first update).

	it('does not start a view transition for the cue of an async Action', async () => {
		let open!: () => void;
		const gate = new Promise<void>((done) => (open = done));
		const vt = installViewTransitionMocks();
		try {
			const types: string[][] = [];
			let setTab!: (tab: string) => void;
			const { container } = mountWith(ViewTransitionShell, {
				expose: (set: (tab: string) => void) => (setTab = set),
				onPress: (start: (fn: () => Promise<void>) => void) =>
					start(async () => {
						await gate;
						startTransition(() => {
							addTransitionType('tabs');
							setTab('bbbb');
						});
					}),
				onUpdate: (next: string[]) => types.push(next),
			});

			(container.querySelector('button') as HTMLButtonElement).click();
			await untilTasks(() => false);
			expect(container.textContent).toBe('gopendinga');
			expect(vt.calls).toHaveLength(0);

			open();
			await untilTasks(() => container.textContent === 'goidlebbbb');
			expect(vt.calls).toHaveLength(1);
			expect(types).toEqual([['tabs']]);
		} finally {
			open();
			vt.restore();
		}
	});

	it('shows the fallback when the cue itself suspends', async () => {
		let resolve!: (value: string) => void;
		const spinner = new Promise<string>((done) => (resolve = done));
		let open!: () => void;
		const gate = new Promise<void>((done) => (open = done));
		const { container } = mountWith(SuspendingCueShell, {
			spinner,
			onPress: (start: (fn: () => Promise<void>) => void) => start(() => gate),
		});
		try {
			(container.querySelector('button') as HTMLButtonElement).click();
			await untilTasks(() => false);
			// The boundary hides its committed content behind the fallback.
			expect(container.querySelector('p:not([style])')!.textContent).toBe('loading');

			resolve('spinner');
			// The reveal waits out the fallback throttle.
			await vi.waitFor(() => expect(container.textContent).toBe('gospinnerpending'));
		} finally {
			open();
		}
		await untilTasks(() => container.textContent === 'goidle');
		expect(container.textContent).toBe('goidle');
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
