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
	useEffect,
	useLayoutEffect,
	useLinkedState,
	useState,
	useTransition,
	ViewTransition,
	type Root,
	type ComponentBody,
} from '../src/index.js';
import { enableNativeReadCollection } from '../src/runtime.js';
import { createScope } from '../src/signals/index.js';
import { installViewTransitionMocks } from './conformance/_helpers/view-transition-mocks.js';

const roots: Root[] = [];

function mount(body: ComponentBody): HTMLElement {
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

describe('Action cues and native capture', () => {
	it('keeps cue ordering and urgent signal writes when native readers follow transitions', async () => {
		startTransition(() => {});
		enableNativeReadCollection();
		const owner = createScope({ scopeKey: 'transition-task.native-readers' });
		const count$ = owner.signal$('count', 0);
		let begin!: () => void;
		try {
			const container = mount(() => {
				const [value, setValue] = useState(0, Symbol.for('transition-task.native-value'));
				const [pending, start] = useTransition(Symbol.for('transition-task.native-pending'));
				begin = () => start(() => setValue(1));
				return createElement(
					'output',
					null,
					`${count$.get()}:${value}:${pending ? 'pending' : 'idle'}`,
				);
			});
			count$.set(1);
			await microtasks();
			expect(container.textContent).toBe('1:0:idle');
			begin();
			await microtasks();
			expect(container.textContent).toBe('1:0:pending');
			await act(() => {});
			expect(container.textContent).toBe('1:1:idle');
		} finally {
			for (const root of roots.splice(0)) root.unmount();
			owner.dispose();
		}
	});

	it('does not let a layout-committed Action cue suppress a later native capture', async () => {
		const native = installViewTransitionMocks();
		let update!: (value: number) => void;
		function ActionOwner() {
			const [value, dispatch, pending] = useActionState(
				() => 1,
				0,
				Symbol.for('transition-task.layout-action'),
			);
			useLayoutEffect(
				() => {
					dispatch();
				},
				[],
				Symbol.for('transition-task.layout-dispatch'),
			);
			return createElement('p', null, `${value}${pending ? 'P' : ''}`);
		}
		function Animated() {
			const [value, setValue] = useState(0, Symbol.for('transition-task.after-layout-action'));
			update = setValue;
			return createElement(
				ViewTransition,
				{ default: 'fade' },
				createElement('output', null, String(value)),
			);
		}
		try {
			const animated = mount(Animated);
			const action = mount(ActionOwner);
			expect(action.textContent).toBe('0P');
			startTransition(() => update(1));
			await act(async () => {});
			expect(animated.textContent).toBe('1');
			expect(native.calls).toHaveLength(1);
		} finally {
			await act(() => {});
			native.restore();
		}
	});

	for (const separateRoot of [false, true]) {
		for (const dispatchFirst of [false, true]) {
			it(`captures explicit transition state alongside an Action cue (separate root: ${separateRoot}, dispatch first: ${dispatchFirst})`, async () => {
				const native = installViewTransitionMocks();
				const action = gate();
				let dispatch!: () => void;
				let update!: (value: number) => void;
				function ActionCue() {
					const [, run, pending] = useActionState(
						async (value: number) => {
							await action.promise;
							return value + 1;
						},
						0,
						Symbol.for('transition-task.captured-cue'),
					);
					dispatch = run;
					return createElement('p', null, pending ? 'pending' : 'ready');
				}
				function Animated() {
					const [value, setValue] = useState(0, Symbol.for('transition-task.captured-state'));
					update = setValue;
					return createElement(
						ViewTransition,
						{ default: 'fade' },
						createElement('output', null, String(value)),
						separateRoot ? null : ActionCue(),
					);
				}
				try {
					const animated = mount(Animated);
					const cue = separateRoot ? mount(ActionCue) : animated;
					startTransition(() => {
						if (dispatchFirst) dispatch();
						update(1);
						if (!dispatchFirst) dispatch();
					});
					await microtasks();
					// The cue commits first, with the previous state and no capture, even
					// in the component that holds the transition's state; that state is
					// captured when its task renders it.
					expect(native.calls).toHaveLength(0);
					expect(animated.querySelector('output')!.textContent).toBe('0');
					expect(cue.querySelector('p')!.textContent).toBe('pending');
					await act(async () => {});
					expect(native.calls).toHaveLength(1);
					expect(animated.querySelector('output')!.textContent).toBe('1');
					expect(cue.querySelector('p')!.textContent).toBe('pending');
				} finally {
					await act(async () => action.resolve());
					native.restore();
				}
			});
		}
	}

	for (const work of ['root render', 'initial root', 'descendant root', 'native signal'] as const) {
		it(`preserves a ${work} capture alongside an Action cue`, async () => {
			const native = installViewTransitionMocks();
			const action = gate();
			const { enableNativeReadCollection } = await import('../src/runtime.js');
			const { createScope } = await import('../src/signals/index.js');
			enableNativeReadCollection();
			const owner = createScope({ scopeKey: `transition-task-${work}` });
			const value$ = owner.signal$('value', 0);
			let dispatch!: () => void;
			function Cue() {
				const [, run, pending] = useActionState(
					async (value: number) => {
						await action.promise;
						return value + 1;
					},
					0,
					Symbol.for('transition-task.other-receipt-cue'),
				);
				dispatch = run;
				return createElement(
					ViewTransition,
					{ default: 'fade' },
					createElement('p', null, pending ? 'pending' : 'ready'),
				);
			}
			function Animated({ value = 0 }: { value?: number }) {
				return createElement(
					'section',
					null,
					createElement(
						ViewTransition,
						{ default: 'fade' },
						createElement('output', null, String(work === 'native signal' ? value$.get() : value)),
					),
					work === 'descendant root' ? createElement(Cue) : null,
				);
			}
			try {
				const container = work === 'initial root' ? document.createElement('div') : mount(Animated);
				const root = work === 'initial root' ? createRoot(container) : roots.at(-1)!;
				if (work === 'initial root') {
					document.body.append(container);
					roots.push(root);
				}
				if (work !== 'descendant root') mount(Cue);
				startTransition(() => {
					dispatch();
					if (work === 'native signal') value$.set(1);
					else root.render(Animated, { value: 1 });
				});
				await microtasks();
				if (work !== 'native signal') {
					expect(native.calls).toHaveLength(0);
					expect(container.querySelector('output')?.textContent ?? '').toBe(
						work === 'initial root' ? '' : '0',
					);
					await act(async () => {});
				}
				expect(native.calls).toHaveLength(1);
				expect(container.querySelector('output')!.textContent).toBe('1');
			} finally {
				await act(async () => action.resolve());
				for (const root of roots) root.unmount();
				owner.dispose();
				native.restore();
			}
		});
	}

	for (const linked of [false, true]) {
		it(`does not treat a flushSync-consumed transition as work for a later Action cue (linked: ${linked})`, async () => {
			const native = installViewTransitionMocks();
			const action = gate();
			let dispatch!: () => void;
			let update!: (value: number) => void;
			function App() {
				const [value, setValue] = linked
					? useLinkedState(
							0,
							(source: number) => source,
							undefined,
							Symbol.for('transition-task.consumed-linked'),
						)
					: useState(0, Symbol.for('transition-task.consumed-state'));
				const [, run, pending] = useActionState(
					async (state: number) => {
						await action.promise;
						return state + 1;
					},
					0,
					Symbol.for('transition-task.after-consumed-state'),
				);
				update = setValue;
				dispatch = run;
				return createElement(
					ViewTransition,
					{ default: 'fade' },
					createElement('output', null, `${value}${pending ? ' pending' : ''}`),
				);
			}
			try {
				const container = mount(App);
				startTransition(() => update(1));
				flushSync(() => {});
				native.calls.length = 0;
				startTransition(() => dispatch());
				await microtasks();
				expect(container.textContent).toBe('1 pending');
				expect(native.calls).toHaveLength(0);
			} finally {
				await act(async () => action.resolve());
				native.restore();
			}
		});
	}

	it.each(['microtask', 'sync act', 'passive'] as const)(
		'publishes an Action cue without waiting for a native View Transition (%s)',
		async (entry) => {
			const native = installViewTransitionMocks();
			const action = gate();
			const nativeReady = gate();
			const updates: Array<() => void | Promise<void>> = [];
			(
				document as unknown as {
					startViewTransition: (
						input: (() => void | Promise<void>) | { update: () => void | Promise<void> },
					) => unknown;
				}
			).startViewTransition = (input) => {
				updates.push(typeof input === 'function' ? input : input.update);
				return { ready: nativeReady.promise, finished: nativeReady.promise, skipTransition() {} };
			};
			let dispatch!: () => void;
			function Form() {
				const [state, run, pending] = useActionState(
					async (value: number) => {
						await action.promise;
						return value + 1;
					},
					0,
					Symbol.for('transition-task.native-action'),
				);
				dispatch = run;
				if (entry === 'passive')
					useEffect(
						() => {
							startTransition(() => dispatch());
						},
						[],
						Symbol.for('transition-task.passive-native-cue'),
					);
				return createElement(
					ViewTransition,
					{ default: 'fade' },
					createElement('output', null, `${state}${pending ? ' pending' : ''}`),
				);
			}
			try {
				const container = mount(Form);
				if (entry === 'microtask') startTransition(() => dispatch());
				else if (entry === 'sync act') act(() => startTransition(() => dispatch()));
				else act(() => {});
				await microtasks();
				expect(container.textContent).toBe('0 pending');
				expect(updates).toHaveLength(0);
				action.resolve();
				await vi.waitFor(() => expect(updates).toHaveLength(1));
				await updates[0]();
				nativeReady.resolve();
				await act(async () => {});
				expect(container.textContent).toBe('1');
			} finally {
				action.resolve();
				for (const update of updates) await update();
				nativeReady.resolve();
				await act(async () => {});
				native.restore();
			}
		},
	);

	for (const dispatchFirst of [false, true]) {
		it(`keeps sibling transition content while publishing an Action cue (dispatch first: ${dispatchFirst})`, async () => {
			const action = gate();
			const data = gate();
			let start!: () => void;
			function Content({ page }: { page: number }) {
				if (page === 1) use(data.promise);
				return createElement('span', null, `page ${page}`);
			}
			function App() {
				const [page, update] = useState(0, Symbol.for('transition-task.action-sibling'));
				const [, dispatch, pending] = useActionState(
					async (value: number) => {
						await action.promise;
						return value + 1;
					},
					0,
					Symbol.for('transition-task.action-sibling-queue'),
				);
				start = () =>
					startTransition(() => {
						if (dispatchFirst) dispatch();
						update(1);
						if (!dispatchFirst) dispatch();
					});
				return createElement(
					'div',
					null,
					createElement('output', null, pending ? 'pending' : 'ready'),
					createElement(Suspense, {
						fallback: createElement('i', null, 'fallback'),
						children: createElement(Content, { page }),
					}),
				);
			}
			const container = mount(App);
			try {
				start();
				await microtasks();
				expect(container.textContent).toBe('pendingpage 0');
			} finally {
				await act(async () => {
					action.resolve();
					data.resolve();
				});
			}
			expect(container.textContent).toBe('readypage 1');
		});
	}
});
