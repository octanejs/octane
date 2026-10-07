import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	act,
	createElement,
	createRoot,
	flushSync,
	Suspense,
	startTransition,
	use,
	useActionState,
	useLayoutEffect,
	useOptimistic,
	useState,
	useTransition,
	type Root,
} from '../src/index.js';

const roots: Root[] = [];

function mount(body: () => ReturnType<typeof createElement>): HTMLElement {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	roots.push(root);
	flushSync(() => root.render(body, {}));
	return container;
}

async function microtasks(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

function gate() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => (resolve = done));
	return { promise, resolve };
}

afterEach(async () => {
	for (const root of roots) root.unmount();
	roots.length = 0;
	await act(() => {});
	document.body.replaceChildren();
	vi.restoreAllMocks();
});

describe('transition rendering yields to the host', () => {
	it('defers an initial transition render while ordinary initial mounts stay synchronous', async () => {
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		roots.push(root);
		startTransition(() => root.render(createElement('output', null, 'transition')));
		await microtasks();
		expect(container.textContent).toBe('');
		await act(async () => {});
		expect(container.textContent).toBe('transition');
		const ordinary = mount(() => createElement('output', null, 'ordinary'));
		expect(ordinary.textContent).toBe('ordinary');
	});

	it('does not publish a queued transition after its root unmounts', async () => {
		let update!: (value: number) => void;
		const published: number[] = [];
		function Counter() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.unmount'));
			update = setValue;
			useLayoutEffect(
				() => {
					published.push(value);
				},
				null,
				Symbol.for('transition-task.unmount-effect'),
			);
			return createElement('output', null, String(value));
		}
		const container = mount(Counter);
		startTransition(() => update(1));
		roots.at(-1)!.unmount();
		await act(async () => {});
		expect(container.textContent).toBe('');
		expect(published).toEqual([0]);
	});

	it('retains committed DOM through a microtask-only checkpoint', async () => {
		let update!: (value: number) => void;
		function Counter() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.value'));
			update = setValue;
			return createElement('output', null, String(value));
		}
		const container = mount(Counter);

		startTransition(() => update(1));
		await microtasks();
		expect(container.textContent).toBe('0');
		await act(async () => {});
		expect(container.textContent).toBe('1');
	});

	it('lets an urgent update upgrade work waiting for a host task', async () => {
		let update!: (value: number) => void;
		function Counter() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.upgrade'));
			update = setValue;
			return createElement('output', null, String(value));
		}
		const container = mount(Counter);

		startTransition(() => update(1));
		update(2);
		await microtasks();
		expect(container.textContent).toBe('2');
		startTransition(() => update(3));
		await microtasks();
		expect(container.textContent).toBe('2');
		await act(async () => {});
		expect(container.textContent).toBe('3');
	});

	it('keeps flushSync synchronous with a transition task outstanding', async () => {
		let update!: (value: number) => void;
		function Counter() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.sync'));
			update = setValue;
			return createElement('output', null, String(value));
		}
		const container = mount(Counter);
		startTransition(() => update(1));
		flushSync(() => {});
		expect(container.textContent).toBe('1');
		startTransition(() => update(2));
		await act(async () => {});
		expect(container.textContent).toBe('2');
	});

	it('does not let an urgent callback consumed by flushSync drain a newer transition', async () => {
		let update!: (value: number) => void;
		function Counter() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.stale'));
			update = setValue;
			return createElement('output', null, String(value));
		}
		const container = mount(Counter);
		update(1);
		flushSync(() => {});
		startTransition(() => update(2));
		await microtasks();
		expect(container.textContent).toBe('1');
		await act(async () => {});
		expect(container.textContent).toBe('2');
	});

	it('runs every ready Action in order while its result rendering waits for a task', async () => {
		let dispatch!: (payload: number) => void;
		let complete!: () => void;
		const completed = new Promise<void>((resolve) => (complete = resolve));
		const previousStates: number[] = [];
		function Form() {
			const [state, run, pending] = useActionState(
				(previous: number, payload: number) => {
					previousStates.push(previous);
					if (previous === 99) complete();
					return previous + payload;
				},
				0,
				Symbol.for('transition-task.action'),
			);
			dispatch = run;
			return createElement('output', null, `${state}${pending ? ' pending' : ''}`);
		}
		const container = mount(Form);

		startTransition(() => {
			for (let i = 0; i < 100; i++) dispatch(1);
		});
		await completed;
		await microtasks();
		expect(previousStates).toEqual(Array.from({ length: 100 }, (_, i) => i));
		expect(container.textContent).toBe('0 pending');
		await act(async () => {});
		expect(container.textContent).toBe('100');
	});

	it('coalesces the ready backlog after a gated Action without skipping previous states', async () => {
		const first = gate();
		const completed = gate();
		let dispatch!: () => void;
		const previousStates: number[] = [];
		function Form() {
			const [state, run, pending] = useActionState(
				async (previous: number) => {
					previousStates.push(previous);
					if (previous === 0) await first.promise;
					if (previous === 99) completed.resolve();
					return previous + 1;
				},
				0,
				Symbol.for('transition-task.gated-action'),
			);
			dispatch = run;
			return createElement('output', null, `${state}${pending ? ' pending' : ''}`);
		}
		const container = mount(Form);
		startTransition(() => {
			for (let i = 0; i < 100; i++) dispatch();
		});
		await act(async () => {});
		expect(previousStates).toEqual([0]);
		expect(container.textContent).toBe('0 pending');

		first.resolve();
		await completed.promise;
		await microtasks();
		expect(previousStates).toEqual(Array.from({ length: 100 }, (_, i) => i));
		expect(container.textContent).toBe('0 pending');
		await act(async () => {});
		expect(container.textContent).toBe('100');
	});

	it('continues queued Actions after failures using their dispatch-time action and previous result', async () => {
		const first = gate();
		const failure = new Error('Action failed');
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const calls: Array<[string, number, number]> = [];
		let dispatch!: (payload: number) => void;
		let replace!: () => void;
		function Form() {
			const [version, setVersion] = useState('old', Symbol.for('transition-task.version'));
			replace = () => setVersion('new');
			const [state, run, pending] = useActionState(
				async (previous: number, payload: number) => {
					calls.push([version, previous, payload]);
					if (payload === 1) await first.promise;
					if (payload === 2) throw failure;
					return previous + payload;
				},
				0,
				Symbol.for('transition-task.recovery'),
			);
			dispatch = run;
			return createElement('output', null, `${state}${pending ? ' pending' : ''}`);
		}
		const container = mount(Form);
		startTransition(() => {
			dispatch(1);
			dispatch(2);
			dispatch(3);
		});
		await microtasks();
		flushSync(replace);
		await act(async () => first.resolve());
		expect(calls).toEqual([
			['old', 0, 1],
			['old', 1, 2],
			['old', 1, 3],
		]);
		expect(container.textContent).toBe('4');
		expect(errors).toHaveBeenCalledWith(failure);
		await act(async () => startTransition(() => dispatch(4)));
		expect(calls.at(-1)).toEqual(['new', 4, 4]);
		expect(container.textContent).toBe('8');
	});

	it('keeps the pending cue and previous Suspense content until a deferred result is ready', async () => {
		const data = gate();
		let start!: () => void;
		function Content({ value }: { value: number }) {
			if (value === 1) use(data.promise);
			return createElement('span', null, `page ${value}`);
		}
		function App() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.page'));
			const [pending, transition] = useTransition(Symbol.for('transition-task.pending'));
			start = () => transition(() => setValue(1));
			return createElement(
				'div',
				null,
				createElement('output', null, pending ? 'pending' : 'ready'),
				createElement(Suspense, {
					fallback: createElement('span', null, 'fallback'),
					children: createElement(Content, { value }),
				}),
			);
		}
		const container = mount(App);
		await act(async () => start());
		expect(container.textContent).toBe('pendingpage 0');
		await act(async () => data.resolve());
		expect(container.textContent).toBe('readypage 1');
	});

	it('commits the completed result without duplicating its optimistic value', async () => {
		const response = gate();
		let submit!: () => void;
		const committed: string[] = [];
		function Form() {
			const [items, setItems] = useState(['x'], Symbol.for('transition-task.items'));
			const [optimistic, add] = useOptimistic(
				items,
				(previous: string[], value: string) => [...previous, `${value}?`],
				Symbol.for('transition-task.optimistic'),
			);
			submit = () =>
				startTransition(async () => {
					add('y');
					await response.promise;
					setItems(['x', 'y']);
				});
			const text = optimistic.join(',');
			useLayoutEffect(
				() => {
					committed.push(text);
				},
				null,
				Symbol.for('transition-task.commit'),
			);
			return createElement('output', null, text);
		}
		const container = mount(Form);
		await act(async () => submit());
		expect(container.textContent).toBe('x,y?');
		await act(async () => response.resolve());
		expect(container.textContent).toBe('x,y');
		expect(committed).toContain('x,y?');
		expect(committed).not.toContain('x,y,y?');
	});

	it('finishes an empty transition started by a flushSync layout effect', async () => {
		let update!: () => void;
		function App() {
			const [enabled, setEnabled] = useState(false, Symbol.for('transition-task.layout-start'));
			const [pending, transition] = useTransition(Symbol.for('transition-task.layout-pending'));
			update = () => setEnabled(true);
			useLayoutEffect(
				() => {
					if (enabled) transition(() => {});
				},
				[enabled],
				Symbol.for('transition-task.layout'),
			);
			return createElement(
				'output',
				null,
				`${enabled ? 'enabled' : 'disabled'} ${pending ? 'pending' : 'ready'}`,
			);
		}
		const container = mount(App);
		flushSync(update);
		await act(async () => {});
		expect(container.textContent).toBe('enabled ready');
	});

	it('does not extend async priority to unrelated updates after the Action settles', async () => {
		const response = gate();
		let update!: (value: number) => void;
		function App() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.async-window'));
			update = setValue;
			return createElement('output', null, String(value));
		}
		const container = mount(App);
		startTransition(async () => {
			await response.promise;
			update(1);
		});
		response.resolve();
		await microtasks();
		expect(container.textContent).toBe('0');
		update(2);
		await microtasks();
		expect(container.textContent).toBe('2');
	});
});
