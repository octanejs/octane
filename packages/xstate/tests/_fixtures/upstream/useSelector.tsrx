// Ported from @xstate/react@6.1.0 test/useSelector.test.tsx
// (statelyai/xstate @ d4f8c5b709291d44f70139a7f9ff333abd7c615c) for the Octane
// test renderer.
//
// Permitted transformations, and only these:
//   1. `@testing-library/react` -> `@octanejs/testing-library`
//   2. `import * as React from 'react'` -> `from 'octane'`. Upstream's
//      `React.useState` / `React.useEffect` / `React.useRef` calls are
//      namespace-imported base hooks, which the compiler slots directly.
//   3. `'../src/index.ts'` -> `'@octanejs/xstate'`
//   4. `describe`/`it`/`expect`/`vi`/`afterEach` are imported (globals: false)
//   5. the React class `ErrorBoundary` becomes a `@try`/`@catch` component —
//      Octane has no class components. Same `data-testid`, same message, same
//      assertion; only the way a boundary is spelled changes.
//   6. `.tsx` -> `.tsrx`
//
// Every `it` name and every assertion is preserved verbatim, INCLUDING the
// `suiteKey === 'strict' ? … : …` expressions: `./utils.ts` supplies only the
// applicable mode, so those expressions evaluate to upstream's own non-strict
// expectations without the assertion text being touched.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@octanejs/testing-library';
import * as React from 'octane';
import {
	ActorRef,
	ActorRefFrom,
	AnyMachineSnapshot,
	assign,
	createMachine,
	fromCallback,
	fromPromise,
	fromTransition,
	createActor,
	AnyStateMachine,
	StateFrom,
	TransitionSnapshot,
	setup,
} from 'xstate';
import { shallowEqual, useActorRef, useMachine, useSelector } from '@octanejs/xstate';
import { describeEachReactMode } from './utils.ts';

// OCTANE DIVERGENCE: Octane has no class components, so upstream's inline
// `class ErrorBoundary extends React.Component` with `getDerivedStateFromError`
// becomes a `@try`/`@catch` component. It catches the same render-phase throw
// and renders the same `data-testid="error"` node with the same message.
//
// Two structural consequences, both forced by the directive rather than chosen:
// `@try` arms are hoisted per component, so the directive cannot sit inside a
// module-level callback (the `it` body) and cannot read `props.children` from
// its enclosing component. The guarded child is therefore named directly in the
// arm and its machine is threaded in as a prop — the same shape the runtime's
// own fixtures use. The upstream class captured nothing, so hoisting changes
// nothing it observed.
function ErrorProbe(props: { machine: AnyStateMachine }) @{
	const actorRef = useActorRef(props.machine);
	const value = useSelector(actorRef, (s) => s.value);
	<div data-testid="value">{String(value)}</div>
}

function ErrorBoundary(props: { machine: AnyStateMachine }) @{
	@try {
		<ErrorProbe machine={props.machine} />
	} @catch (error) {
		<div data-testid="error">{(error as Error).message}</div>
	}
}

const originalConsoleError = console.error;

afterEach(() => {
	console.error = originalConsoleError;
});

describeEachReactMode('useSelector (%s)', ({ suiteKey, render }) => {
	it('only rerenders for selected values', () => {
		const machine = createMachine({
			types: {} as { context: { count: number; other: number } },
			initial: 'active',
			context: {
				other: 0,
				count: 0,
			},
			states: {
				active: {},
			},
			on: {
				OTHER: {
					actions: assign({ other: ({ context }) => context.other + 1 }),
				},
				INCREMENT: {
					actions: assign({ count: ({ context }) => context.count + 1 }),
				},
			},
		});

		let rerenders = 0;

		const App = () => {
			const service = useActorRef(machine);
			const count = useSelector(service, (state) => state.context.count);

			rerenders++;

			return <>
				<div data-testid="count">{count}</div>
				<button data-testid="other" onClick={() => service.send({ type: 'OTHER' })}></button>
				<button
					data-testid="increment"
					onClick={() => service.send({ type: 'INCREMENT' })}
				></button>
			</>;
		};

		render(<App />);
		const countButton = screen.getByTestId('count');
		const otherButton = screen.getByTestId('other');
		const incrementEl = screen.getByTestId('increment');

		fireEvent.click(incrementEl);

		rerenders = 0;

		fireEvent.click(otherButton);
		fireEvent.click(otherButton);
		fireEvent.click(otherButton);
		fireEvent.click(otherButton);

		expect(rerenders).toEqual(0);

		fireEvent.click(incrementEl);

		expect(countButton.textContent).toBe('2');
	});

	it('should work with a custom comparison function', () => {
		const machine = createMachine({
			types: {} as {
				context: { name: string };
				events: { type: 'CHANGE'; value: string };
			},
			initial: 'active',
			context: {
				name: 'david',
			},
			states: {
				active: {},
			},
			on: {
				CHANGE: {
					actions: assign({ name: ({ event }) => event.value }),
				},
			},
		});

		const App = () => {
			const service = useActorRef(machine);
			const name = useSelector(
				service,
				(state) => state.context.name,
				(a, b) => a.toUpperCase() === b.toUpperCase(),
			);

			return <>
				<div data-testid="name">{name}</div>
				<button
					data-testid="sendUpper"
					onClick={() => service.send({ type: 'CHANGE', value: 'DAVID' })}
				></button>
				<button
					data-testid="sendOther"
					onClick={() => service.send({ type: 'CHANGE', value: 'other' })}
				></button>
			</>;
		};

		render(<App />);
		const nameEl = screen.getByTestId('name');
		const sendUpperButton = screen.getByTestId('sendUpper');
		const sendOtherButton = screen.getByTestId('sendOther');

		expect(nameEl.textContent).toEqual('david');

		fireEvent.click(sendUpperButton);

		// unchanged due to comparison function
		expect(nameEl.textContent).toEqual('david');

		fireEvent.click(sendOtherButton);

		expect(nameEl.textContent).toEqual('other');

		fireEvent.click(sendUpperButton);

		expect(nameEl.textContent).toEqual('DAVID');
	});

	it('should work with the shallowEqual comparison function', () => {
		const machine = createMachine({
			types: {} as { context: { user: { name: string } } },
			initial: 'active',
			context: {
				user: { name: 'david' },
			},
			states: {
				active: {},
			},
			on: {
				'change.same': {
					// New object reference
					actions: assign({ user: { name: 'david' } }),
				},
				'change.other': {
					// New object reference
					actions: assign({ user: { name: 'other' } }),
				},
			},
		});

		const App = () => {
			const service = useActorRef(machine);
			const [userChanges, setUserChanges] = React.useState(0);
			const user = useSelector(service, (state) => state.context.user, shallowEqual);
			const prevUser = React.useRef(user);

			React.useEffect(() => {
				if (user !== prevUser.current) {
					setUserChanges((c) => c + 1);
				}
				prevUser.current = user;
			}, [user]);

			return <>
				<div data-testid="name">{user.name}</div>
				<div data-testid="changes">{userChanges}</div>
				<button
					data-testid="sendSame"
					onClick={() => service.send({ type: 'change.same' })}
				></button>
				<button
					data-testid="sendOther"
					onClick={() => service.send({ type: 'change.other' })}
				></button>
			</>;
		};

		render(<App />);
		const nameEl = screen.getByTestId('name');
		const changesEl = screen.getByTestId('changes');
		const sendSameButton = screen.getByTestId('sendSame');
		const sendOtherButton = screen.getByTestId('sendOther');

		expect(nameEl.textContent).toEqual('david');

		// unchanged due to comparison function
		fireEvent.click(sendSameButton);
		expect(nameEl.textContent).toEqual('david');
		expect(changesEl.textContent).toEqual('0');

		// changed
		fireEvent.click(sendOtherButton);
		expect(nameEl.textContent).toEqual('other');
		expect(changesEl.textContent).toEqual('1');

		// changed
		fireEvent.click(sendSameButton);
		expect(nameEl.textContent).toEqual('david');
		expect(changesEl.textContent).toEqual('2');

		// unchanged due to comparison function
		fireEvent.click(sendSameButton);
		expect(nameEl.textContent).toEqual('david');
		expect(changesEl.textContent).toEqual('2');
	});

	it('should work with selecting values from initially invoked actors', () => {
		const childMachine = createMachine({
			id: 'childMachine',
			initial: 'active',
			states: {
				active: {},
			},
		});
		const machine = createMachine({
			initial: 'active',
			invoke: {
				id: 'child',
				src: childMachine,
			},
			states: {
				active: {},
			},
		});

		const ChildTest: React.FC<{
			actor: ActorRefFrom<typeof childMachine>;
		}> = ({ actor }) => {
			const state = useSelector(actor, (s) => s);

			expect(state.value).toEqual('active');

			return null;
		};

		const Test = () => {
			const actorRef = useActorRef(machine);
			const childActor = useSelector(
				actorRef,
				(s) => s.children.child as ActorRefFrom<typeof childMachine>,
			);
			return <ChildTest actor={childActor} />;
		};

		render(<Test />);
	});

	it('should work with selecting values from initially spawned actors', () => {
		const childMachine = createMachine({
			types: {} as { context: { count: number } },
			context: {
				count: 0,
			},
			on: {
				UPDATE_COUNT: {
					actions: assign({
						count: ({ context }) => context.count + 1,
					}),
				},
			},
		});

		const parentMachine = createMachine({
			types: {
				context: {} as {
					childActor: ActorRefFrom<typeof childMachine>;
				},
			},
			context: ({ spawn }) => ({
				childActor: spawn(childMachine),
			}),
		});
		const selector = (state: StateFrom<typeof childMachine>) => state.context.count;

		const App = () => {
			const [state] = useMachine(parentMachine);
			const actor = state.context.childActor;
			const count = useSelector(actor, selector);

			return <>
				<div data-testid="count">{count}</div>

				<button onClick={() => actor.send({ type: 'UPDATE_COUNT' })} data-testid="button" />
			</>;
		};

		render(<App />);

		const buttonEl = screen.getByTestId('button');
		const countEl = screen.getByTestId('count');

		expect(countEl.textContent).toEqual('0');
		fireEvent.click(buttonEl);
		expect(countEl.textContent).toEqual('1');
	});

	it('should immediately render snapshot of initially spawned custom actor', () => {
		const createCustomActor = (latestValue: string) => createActor(
			fromTransition((s) => s, latestValue),
		);

		const parentMachine = createMachine({
			types: {
				context: {} as {
					childActor: ReturnType<typeof createCustomActor>;
				},
			},
			context: () => ({
				childActor: createCustomActor('foo'),
			}),
		});

		const identitySelector = (value: any) => value;

		const App = () => {
			const [state] = useMachine(parentMachine);
			const actor = state.context.childActor;

			const value = useSelector(actor, identitySelector);

			return <>
				{value.context}
			</>;
		};

		const { container } = render(<App />);
		expect(container.textContent).toEqual('foo');
	});

	it('should rerender with a new value when the selector changes', () => {
		const childMachine = createMachine({
			types: {} as { context: { count: number } },
			context: {
				count: 0,
			},
			on: {
				INC: {
					actions: assign({
						count: ({ context }) => context.count + 1,
					}),
				},
			},
		});

		const parentMachine = createMachine({
			types: {
				context: {} as {
					childActor: ActorRefFrom<typeof childMachine>;
				},
			},
			context: ({ spawn }) => ({
				childActor: spawn(childMachine),
			}),
		});

		const App = ({ prop }: { prop: string }) => {
			const [state] = useMachine(parentMachine);
			const actor = state.context.childActor;
			const value = useSelector(actor, (state) => `${prop} ${state.context.count}`);

			return <div data-testid="value">{value}</div>;
		};

		const { container, rerender } = render(<App prop="first" />);

		expect(container.textContent).toEqual('first 0');

		rerender(<App prop="second" />);
		expect(container.textContent).toEqual('second 0');
	});

	it('should use a fresh selector for subscription updates after selector change', () => {
		const childMachine = createMachine({
			types: {} as { context: { count: number } },
			context: {
				count: 0,
			},
			on: {
				INC: {
					actions: assign({
						count: ({ context }) => context.count + 1,
					}),
				},
			},
		});

		const parentMachine = createMachine({
			types: {
				context: {} as {
					childActor: ActorRefFrom<typeof childMachine>;
				},
			},
			context: ({ spawn }) => ({
				childActor: spawn(childMachine),
			}),
		});

		const App = ({ prop }: { prop: string }) => {
			const [state] = useMachine(parentMachine);
			const actor = state.context.childActor;
			const value = useSelector(actor, (state) => `${prop} ${state.context.count}`);

			return <>
				<div data-testid="value">{value}</div>

				<button
					onClick={() => {
						actor.send({ type: 'INC' });
					}}
				/>
			</>;
		};

		const { rerender } = render(<App prop="first" />);

		const buttonEl = screen.getByRole('button');
		const valueEl = screen.getByTestId('value');

		expect(valueEl.textContent).toEqual('first 0');

		rerender(<App prop="second" />);
		fireEvent.click(buttonEl);

		expect(valueEl.textContent).toEqual('second 1');
	});

	it('should render snapshot value when actor doesn\'t emit anything', () => {
		const createCustomLogic = (latestValue: string) => fromTransition((s) => s, latestValue);

		const parentMachine = createMachine({
			types: {
				context: {} as {
					childActor: ActorRefFrom<typeof createCustomLogic>;
				},
			},
			context: ({ spawn }) => ({
				childActor: spawn(createCustomLogic('foo')),
			}),
		});

		const identitySelector = (value: any) => value;

		const App = () => {
			const [state] = useMachine(parentMachine);
			const actor = state.context.childActor;

			const value = useSelector(actor, identitySelector);

			return <>
				{value.context}
			</>;
		};

		const { container } = render(<App />);
		expect(container.textContent).toEqual('foo');
	});

	it('should render snapshot state when actor changes', () => {
		const createCustomActor = (latestValue: string) => createActor(
			fromTransition((s) => s, latestValue),
		);

		const actor1 = createCustomActor('foo');
		const actor2 = createCustomActor('bar');

		const identitySelector = (value: any) => value;

		const App = ({ prop }: { prop: string }) => {
			const value = useSelector(prop === 'first' ? actor1 : actor2, identitySelector);

			return <>
				{value.context}
			</>;
		};

		const { container, rerender } = render(<App prop="first" />);
		expect(container.textContent).toEqual('foo');

		rerender(<App prop="second" />);
		expect(container.textContent).toEqual('bar');
	});

	it(
		'should keep rendering a new selected value after selector change when the actor doesn\'t emit',
		async () => {
			const actor = createActor(fromTransition((s) => s, undefined));
			actor.subscribe = () => ({ unsubscribe: () => {} });

			const App = ({ selector }: { selector: any }) => {
				const [, forceRerender] = React.useState(0);
				const value = useSelector(actor, selector);

				return <>
					{value as number}
					<button type="button" onClick={() => forceRerender((s) => s + 1)}></button>
				</>;
			};

			const { container, rerender } = render(<App selector={() => 'foo'} />);
			expect(container.textContent).toEqual('foo');

			rerender(<App selector={() => 'bar'} />);
			expect(container.textContent).toEqual('bar');

			fireEvent.click(await screen.findByRole('button'));
			expect(container.textContent).toEqual('bar');
		},
	);

	it('should only rerender once when the selected value changes', () => {
		const selector = (state: any) => state.context.foo;

		const machine = createMachine({
			types: {} as { context: { foo: number }; events: { type: 'INC' } },
			context: {
				foo: 0,
			},
			on: {
				INC: {
					actions: assign({
						foo: ({ context }) => ++context.foo,
					}),
				},
			},
		});

		const service = createActor(machine).start();

		let renders = 0;

		const App = () => {
			++renders;
			useSelector(service, selector);

			return null;
		};

		render(<App />);

		// reset
		renders = 0;
		act(() => {
			service.send({ type: 'INC' });
		});

		expect(renders).toBe(suiteKey === 'strict' ? 2 : 1);
	});

	it(
		'should compute a stable snapshot internally when selecting from uninitialized service',
		() => {
			const child = createMachine({});
			const machine = createMachine({
				invoke: {
					id: 'child',
					src: child,
				},
			});

			const snapshots: AnyMachineSnapshot[] = [];

			function App() {
				const service = useActorRef(machine);
				useSelector(service, (state) => {
					snapshots.push(state);
					return state.children.child;
				});
				return null;
			}

			console.error = vi.fn();
			render(<App />);

			const [snapshot1] = snapshots;
			expect(snapshots.every((s) => s === snapshot1));
			expect(console.error).toHaveBeenCalledTimes(0);
		},
	);

	it(
		`shouldn't interfere with spawning actors that are part of the initial state of an actor`,
		() => {
			let called = false;
			const child = createMachine({
				entry: () => (called = true),
			});
			const machine = createMachine({
				context: ({ spawn }) => ({
					childRef: spawn(child),
				}),
			});

			function App() {
				const service = useActorRef(machine);
				useSelector(service, () => {});
				expect(called).toBe(false);
				return null;
			}

			render(<App />);

			expect(called).toBe(true);
		},
	);

	it('should work with initially deferred actors spawned in lazy context', () => {
		const childMachine = setup({}).createMachine({
			initial: 'one',
			states: {
				one: {
					on: { NEXT: 'two' },
				},
				two: {},
			},
		});

		const machine = setup({
			types: {} as {
				context: { ref: ActorRefFrom<typeof childMachine> };
			},
		}).createMachine({
			context: ({ spawn }) => ({
				ref: spawn(childMachine),
			}),
			initial: 'waiting',
			states: {
				waiting: {
					on: { TEST: 'success' },
				},
				success: {
					type: 'final',
				},
			},
		});

		const App = () => {
			const actorRef = useActorRef(machine);
			const childRef = useSelector(actorRef, (s) => s.context.ref);
			const childState = useSelector(childRef, (s) => s);

			return <>
				<div data-testid="child-state">{childState.value}</div>
				<button data-testid="child-send" onClick={() => childRef.send({ type: 'NEXT' })}></button>
			</>;
		};

		render(<App />);

		const elState = screen.getByTestId('child-state');
		const elSend = screen.getByTestId('child-send');

		expect(elState.textContent).toEqual('one');
		fireEvent.click(elSend);

		expect(elState.textContent).toEqual('two');
	});

	it('should not log any spurious errors when used with a not-started actor', () => {
		const spy = vi.fn();
		console.error = spy;

		const machine = createMachine({});
		const App = () => {
			useSelector(useActorRef(machine), (s) => s);

			return null;
		};

		render(<App />);

		expect(spy).not.toHaveBeenCalled();
	});

	it('should work with an optional actor', () => {
		const Child = (props: {
			actor: ActorRef<TransitionSnapshot<{ count: number }>, any> | undefined;
		}) => {
			const state = useSelector(props.actor, (s) => s);

			// @ts-expect-error
			((_accept: { count: number }) => {})(state?.context);
			((_accept: { count: number } | undefined) => {})(state?.context);

			return <div data-testid="state">{state?.context?.count ?? 'undefined'}</div>;
		};

		const App = () => {
			const [actor, setActor] = React.useState<
				ActorRef<TransitionSnapshot<{ count: number }>, any>
			>();

			return <>
				<button
					data-testid="button"
					onClick={() => setActor(createActor(fromTransition((s) => s, { count: 42 })))}
				>
					Set actor
				</button>
				<Child actor={actor} />
			</>;
		};

		render(<App />);

		const button = screen.getByTestId('button');
		const stateEl = screen.getByTestId('state');

		expect(stateEl.textContent).toBe('undefined');

		fireEvent.click(button);

		expect(stateEl.textContent).toBe('42');
	});

	it(
		'should throw an error to an error boundary when the actor reaches an error state',
		async () => {
			const errorMessage = 'test_useSelector_error';

			const machine = createMachine({
				initial: 'loading',
				states: {
					loading: {
						invoke: {
							src: fromPromise(() => Promise.reject(new Error(errorMessage))),
						},
					},
				},
			});

			console.error = vi.fn();

			render(<ErrorBoundary machine={machine} />);

			await screen.findByTestId('error');
			expect(screen.getByTestId('error').textContent).toBe(errorMessage);
		},
	);
});
