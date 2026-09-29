// @vitest-environment node

import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';
import {
	createContext,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	startTransition,
	universalComponent,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useActionState,
	useContext,
	useLayoutEffect,
	useOptimistic,
	useState,
	useTransition,
	type ObjectHostContainer,
	type UniversalRenderable,
	type UniversalRootOptions,
} from 'octane/universal/native';

const RENDERER = 'native-context-test';
const valuePlan = universalPlan(RENDERER, {
	kind: 'host',
	type: 'value',
	bindings: [['theme', 0]],
});
const nodePlan = universalPlan(RENDERER, {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
});

function node(id: string, value: unknown): UniversalRenderable {
	return universalValue(nodePlan, [
		universalProps([
			['set', 'id', id],
			['set', 'value', value],
		]),
	]);
}

function values(container: ObjectHostContainer): Readonly<Record<string, unknown>> {
	return Object.fromEntries(container.children.map((child) => [child.props.id, child.props.value]));
}

function objectRoot(options?: UniversalRootOptions<ObjectHostContainer>) {
	const container = createObjectContainer(RENDERER);
	const root = createUniversalRoot(container, createObjectDriver(RENDERER), options);
	return { container, root };
}

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T = void>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

async function drainMicrotasks(turns = 12): Promise<void> {
	for (let turn = 0; turn < turns; turn++) await Promise.resolve();
}

describe('host-neutral universal entry', () => {
	it('provides renderer-local context without a DOM owner', () => {
		const Theme = createContext('default');
		const container = createObjectContainer(RENDERER);
		const root = createUniversalRoot(container, createObjectDriver(RENDERER));
		const DefaultValue = defineUniversalComponent(RENDERER, () =>
			universalValue(valuePlan, [useContext(Theme)]),
		);
		const ProvidedValue = defineUniversalComponent(RENDERER, (props: { theme: string }) =>
			Theme({
				value: props.theme,
				children: () => universalValue(valuePlan, [useContext(Theme)]),
			}),
		);

		expect('Provider' in Theme).toBe(false);
		root.render(DefaultValue, undefined);
		expect(container.children[0].props.theme).toBe('default');

		root.render(ProvidedValue, { theme: 'dark' });
		expect(container.children[0].props.theme).toBe('dark');
		root.render(ProvidedValue, { theme: 'light' });
		expect(container.children[0].props.theme).toBe('light');

		root.unmount();
		expect(container.children).toEqual([]);
	});

	it('keeps universal profiling absent from normal bundles and active only when enabled', async () => {
		const source = `
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	markUniversalHostComponent,
	memo,
	universalFor,
	universalHostComponentLeafPlan,
	universalPlan,
	universalProps,
	universalValue,
	useState,
} from 'octane/universal/native';
import { __profileComponent, profiler } from 'octane/profiling';

const renderer = 'profile-proof';
const plan = universalPlan(renderer, {
	kind: 'host',
	type: 'counter',
	propsSlot: 0,
});
const scheduled = [];
let update;
const ProfiledHost = markUniversalHostComponent(
	defineUniversalComponent(renderer, function ProfiledHost(props) {
		return universalValue(plan, [universalProps([['spread', props]])]);
	}),
	renderer,
	plan,
);
const Counter = defineUniversalComponent(renderer, function ProfiledCounter() {
	const [count, setCount] = useState(0, 'count');
	update = setCount;
	return universalFor(
		[count],
		() => 'counter',
		(value) => [value],
		null,
		true,
		true,
		ProfiledHost,
		universalHostComponentLeafPlan(renderer, ProfiledHost, '["value"]'),
		'["value"]',
	);
});

if (__OCTANE_PROFILE_ENABLED__) {
	profiler.start({ timeline: false });
	__profileComponent(Counter, {
		id: 'profile-proof#ProfiledCounter',
		name: 'ProfiledCounter',
		file: 'profile-proof.tsrx',
		line: 1,
		column: 0,
		kind: 'component',
	});
	__profileComponent(ProfiledHost, {
		id: 'profile-proof#ProfiledHost',
		name: 'ProfiledHost',
		file: 'profile-proof.tsrx',
		line: 2,
		column: 0,
		kind: 'component',
	});
}

const WrappedCounter = memo(Counter);
const container = createObjectContainer(renderer);
const objectDriver = createObjectDriver(renderer);
const root = createUniversalRoot(container, {
	...objectDriver,
	capabilities: { ...objectDriver.capabilities, compilerLeafProps: true },
}, {
	scheduleMicrotask(callback) {
		scheduled.push(callback);
	},
});
root.render(WrappedCounter, undefined);
update(1);
scheduled.shift()();
globalThis.renderedValue = container.children[0].props.value;
`;
		const run = async (enabled: boolean) => {
			const result = await build({
				stdin: {
					contents: source,
					resolveDir: resolve(import.meta.dirname, '..'),
					sourcefile: 'universal-profile-proof.ts',
				},
				bundle: true,
				define: { __OCTANE_PROFILE_ENABLED__: JSON.stringify(enabled) },
				format: 'iife',
				metafile: true,
				minify: true,
				platform: 'neutral',
				target: 'esnext',
				treeShaking: true,
				write: false,
			});
			const context: {
				renderedValue?: number;
				__OCTANE_PROFILER__?: typeof import('../src/profiling.js').profiler;
			} = {};
			runInNewContext(result.outputFiles[0].text, context);
			return {
				context,
				inputs: Object.keys(Object.values(result.metafile!.outputs)[0].inputs),
			};
		};

		const disabled = await run(false);
		expect(disabled.context.renderedValue).toBe(1);
		expect(disabled.context.__OCTANE_PROFILER__).toBeUndefined();
		expect(
			disabled.inputs.some((input) => /packages\/octane\/src\/profiling\.ts$/.test(input)),
		).toBe(false);

		const enabled = await run(true);
		expect(enabled.context.renderedValue).toBe(1);
		expect(
			enabled.inputs.some((input) => /packages\/octane\/src\/profiling\.ts$/.test(input)),
		).toBe(true);
		const profileEvents = enabled.context.__OCTANE_PROFILER__?.getEvents().map((event) => ({
			component: event.component,
			phase: event.phase,
			causes: event.causes.map((cause) => cause.type),
		}));
		expect(profileEvents?.filter((event) => event.component === 'ProfiledCounter')).toEqual([
			{ component: 'ProfiledCounter', phase: 'mount', causes: ['mount'] },
			{ component: 'ProfiledCounter', phase: 'update', causes: ['state'] },
		]);
		expect(profileEvents?.filter((event) => event.component === 'ProfiledHost')).toEqual([
			{ component: 'ProfiledHost', phase: 'mount', causes: ['mount'] },
			{ component: 'ProfiledHost', phase: 'update', causes: ['parent'] },
		]);
	});

	it('bundles the public native entry without DOM or React runtime modules', async () => {
		const result = await build({
			stdin: {
				contents: "export * from 'octane/universal/native';",
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'native-consumer.ts',
			},
			bundle: true,
			format: 'esm',
			metafile: true,
			minify: true,
			platform: 'neutral',
			target: 'esnext',
			write: false,
		});
		const output = result.outputFiles[0].text;
		const inputs = Object.keys(Object.values(result.metafile!.outputs)[0].inputs);

		expect(inputs).toEqual(
			expect.arrayContaining([
				expect.stringMatching(/packages\/octane\/src\/universal-core\.ts$/),
				expect.stringMatching(/packages\/octane\/src\/universal-native\.ts$/),
			]),
		);
		expect(
			inputs.some((input) =>
				/(?:^|\/)(?:runtime\.ts|dom-tables\.[jt]s|hydration(?:\/|\.))|react|preact/i.test(input),
			),
		).toBe(false);
		expect(output).not.toMatch(/\b(?:document|window|MutationObserver|HTMLElement)\b/);
	});

	it('keeps a DOM-only public root independent of universal renderer modules', async () => {
		const result = await build({
			stdin: {
				contents:
					"import { createRoot } from 'octane'; globalThis.__octaneCreateRoot = createRoot;",
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'dom-only-consumer.ts',
			},
			bundle: true,
			define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			format: 'iife',
			metafile: true,
			minify: true,
			platform: 'browser',
			target: 'esnext',
			treeShaking: true,
			write: false,
		});
		const inputs = Object.keys(Object.values(result.metafile!.outputs)[0].inputs);

		expect(inputs).toEqual(
			expect.arrayContaining([expect.stringMatching(/packages\/octane\/src\/runtime\.ts$/)]),
		);
		expect(
			inputs.some((input) =>
				/packages\/octane\/src\/universal-(?:core|native|dom-boundary)\.ts$/.test(input),
			),
		).toBe(false);
	});

	it('requires a host scheduler when queueMicrotask is absent and preserves thrown errors', async () => {
		const result = await build({
			stdin: {
				contents: "export * from 'octane/universal/native';",
				resolveDir: resolve(import.meta.dirname, '..'),
				sourcefile: 'native-microtask-consumer.ts',
			},
			bundle: true,
			define: { __OCTANE_PROFILE_ENABLED__: 'false' },
			format: 'iife',
			globalName: 'OctaneNative',
			platform: 'neutral',
			target: 'es2017',
			write: false,
		});
		const context = {} as { OctaneNative: typeof import('octane/universal/native') };
		runInNewContext(result.outputFiles[0].text, context);
		const native = context.OctaneNative;
		expect('createUniversalHostBoundaryAdapter' in native).toBe(false);
		const container = native.createObjectContainer(RENDERER);
		const driver = native.createObjectDriver(RENDERER);
		expect(() =>
			native.createUniversalRoot(container, driver, {
				scheduleMicrotask: 1 as never,
			}),
		).toThrow(/scheduleMicrotask must be a function/);
		expect(() => native.createUniversalRoot(container, driver)).toThrow(
			/options\.scheduleMicrotask/,
		);

		const scheduled: Array<() => void> = [];
		const root = native.createUniversalRoot(container, driver, {
			scheduleMicrotask(callback) {
				scheduled.push(callback);
			},
		});
		let update!: (value: number) => void;
		const Counter = native.defineUniversalComponent(RENDERER, () => {
			const [count, setCount] = native.useState(0);
			update = setCount;
			return native.universalValue(valuePlan, [count]);
		});

		root.render(Counter, undefined);
		expect(container.children[0].props.theme).toBe(0);
		update(1);
		expect(scheduled).toHaveLength(1);
		scheduled.shift()!();
		expect(container.children[0].props.theme).toBe(1);

		const actionContainer = native.createObjectContainer(RENDERER);
		const actionRoot = native.createUniversalRoot(actionContainer, driver, {
			scheduleMicrotask(callback) {
				scheduled.push(callback);
			},
		});
		let dispatch!: (payload: undefined) => void;
		const ThrowingAction = native.defineUniversalComponent(RENDERER, () => {
			const [value, run] = native.useActionState<number, undefined>(() => {
				throw new Error('action-fault');
			}, 0);
			dispatch = run;
			return native.universalValue(valuePlan, [value]);
		});

		actionRoot.render(ThrowingAction, undefined);
		expect(() => dispatch(undefined)).not.toThrow();
		// The unclaimed action error surfaces through the host scheduler, once,
		// alongside the pending/transition work the dispatch scheduled.
		const thrown: string[] = [];
		for (let count = 0; scheduled.length > 0; count++) {
			if (count === 50) throw new Error('Host scheduler did not stabilize.');
			try {
				scheduled.shift()!();
			} catch (error) {
				thrown.push((error as Error).message);
			}
		}
		expect(thrown).toEqual(['action-fault']);
		expect(actionContainer.children[0].props.theme).toBe(0);

		root.unmount();
		actionRoot.unmount();
	});
});

// React 19 useActionState queue semantics on the host-neutral core. The DOM
// runtime's equivalents live in actions.test.ts; the universal hook shares the
// contract but not the implementation.
describe('universal useActionState', () => {
	it('threads each completed result into the next dispatch and stays pending until the queue drains', async () => {
		const gates = [deferred(), deferred()];
		const calls: Array<[number, number]> = [];
		let dispatch!: (amount: number) => void;
		const Counter = defineUniversalComponent(RENDERER, () => {
			const [count, run, pending] = useActionState<number, number>(async (previous, amount) => {
				const gate = gates[calls.length];
				calls.push([previous, amount]);
				await gate.promise;
				return previous + amount;
			}, 0);
			dispatch = run;
			return [node('count', count), node('pending', pending)];
		});
		const { container, root } = objectRoot();

		root.render(Counter, undefined);
		dispatch(1);
		dispatch(10);
		await drainMicrotasks();
		expect(calls).toEqual([[0, 1]]);
		expect(values(container)).toEqual({ count: 0, pending: true });

		gates[0].resolve();
		await drainMicrotasks();
		expect(calls).toEqual([
			[0, 1],
			[1, 10],
		]);
		expect(values(container).pending).toBe(true);

		gates[1].resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 11, pending: false });
		root.unmount();
	});

	it('runs an idle synchronous action during dispatch and threads synchronous results', async () => {
		const calls: Array<[number, number]> = [];
		let dispatch!: (amount: number) => void;
		const Counter = defineUniversalComponent(RENDERER, () => {
			const [count, run, pending] = useActionState<number, number>((previous, amount) => {
				calls.push([previous, amount]);
				return previous + amount;
			}, 0);
			dispatch = run;
			return [node('count', count), node('pending', pending)];
		});
		const { container, root } = objectRoot();

		root.render(Counter, undefined);
		dispatch(2);
		expect(calls).toEqual([[0, 2]]);
		dispatch(3);
		expect(calls).toEqual([
			[0, 2],
			[2, 3],
		]);
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 5, pending: false });
		root.unmount();
	});

	it('stores function-valued initial state and results instead of calling them', async () => {
		type Label = () => string;
		let dispatch!: (next: Label) => void;
		const Labelled = defineUniversalComponent(RENDERER, () => {
			const [label, run] = useActionState<Label, Label>(
				(_previous, next) => next,
				() => 'initial',
			);
			dispatch = run;
			return node('label', label());
		});
		const { container, root } = objectRoot();

		root.render(Labelled, undefined);
		expect(values(container)).toEqual({ label: 'initial' });
		dispatch(() => 'next');
		await drainMicrotasks();
		expect(values(container)).toEqual({ label: 'next' });
		root.unmount();
	});

	it('keeps one dispatcher and runs each queued payload with its dispatch-time action', async () => {
		const gate = deferred();
		const calls: string[] = [];
		const dispatchers = new Set<(payload: string) => void>();
		let dispatch!: (payload: string) => void;
		const actionNamed =
			(name: string) =>
			async (previous: string, payload: string): Promise<string> => {
				calls.push(`${name}(${previous},${payload})`);
				await gate.promise;
				return previous + payload;
			};
		const first = actionNamed('first');
		const second = actionNamed('second');
		const Form = defineUniversalComponent(
			RENDERER,
			(props: { action: (previous: string, payload: string) => Promise<string> }) => {
				const [value, run] = useActionState(props.action, '');
				dispatchers.add(run);
				dispatch = run;
				return node('value', value);
			},
		);
		const { container, root } = objectRoot();

		root.render(Form, { action: first });
		dispatch('a');
		dispatch('b');
		root.render(Form, { action: second });
		dispatch('c');
		expect(dispatchers.size).toBe(1);

		gate.resolve();
		await drainMicrotasks();
		expect(calls).toEqual(['first(,a)', 'first(a,b)', 'second(ab,c)']);
		expect(values(container)).toEqual({ value: 'abc' });
		root.unmount();
	});

	it('keeps the committed action while a transition render that supplies a new one is suspended', async () => {
		const resource = deferred<string>();
		const calls: string[] = [];
		let begin!: () => void;
		let dispatch!: (payload: string) => void;
		const committed = (previous: string, payload: string) => {
			calls.push(`committed(${payload})`);
			return previous + payload;
		};
		const replacement = (previous: string, payload: string) => {
			calls.push(`replacement(${payload})`);
			return previous + payload;
		};
		const Form = defineUniversalComponent(RENDERER, () => {
			const [source, setSource] = useState<Promise<string> | null>(null);
			begin = () => startTransition(() => setSource(resource.promise));
			const [value, run] = useActionState(source === null ? committed : replacement, '');
			dispatch = run;
			return [
				node('value', value),
				universalTry(
					() => node('data', source === null ? 'none' : use(source)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root } = objectRoot();

		root.render(Form, undefined);
		begin();
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: '', data: 'none' });
		dispatch('a');
		expect(calls).toEqual(['committed(a)']);

		resource.resolve('loaded');
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'a', data: 'loaded' });
		dispatch('b');
		await drainMicrotasks();
		expect(calls).toEqual(['committed(a)', 'replacement(b)']);
		expect(values(container)).toEqual({ value: 'ab', data: 'loaded' });
		root.unmount();
	});

	it('continues queued dispatches after an action error and keeps the prior state', async () => {
		const gate = deferred();
		const previousStates: number[] = [];
		const errors: string[] = [];
		let dispatch!: (payload: number | 'reject' | 'throw') => void;
		const Counter = defineUniversalComponent(RENDERER, () => {
			const [count, run, pending] = useActionState<number, number | 'reject' | 'throw'>(
				(previous, payload) => {
					previousStates.push(previous);
					if (payload === 'throw') throw new Error('thrown');
					if (payload === 'reject') return Promise.reject(new Error('rejected'));
					return gate.promise.then(() => previous + payload);
				},
				0,
			);
			dispatch = run;
			return [node('count', count), node('pending', pending)];
		});
		const { container, root } = objectRoot({
			onUncaughtError: (error) => errors.push((error as Error).message),
		});

		root.render(Counter, undefined);
		dispatch(1);
		dispatch('reject');
		dispatch('throw');
		dispatch(2);
		await drainMicrotasks();
		expect(previousStates).toEqual([0]);
		expect(values(container)).toEqual({ count: 0, pending: true });

		gate.resolve();
		await drainMicrotasks();
		expect(previousStates).toEqual([0, 1, 1, 1]);
		expect(errors).toEqual(['rejected', 'thrown']);
		expect(values(container)).toEqual({ count: 3, pending: false });
		root.unmount();
	});

	it('routes an action error to the nearest universalTry boundary', async () => {
		let dispatch!: (payload: undefined) => void;
		const Child = defineUniversalComponent(RENDERER, () => {
			const [value, run] = useActionState<string, undefined>(async () => {
				throw new Error('action-fault');
			}, 'idle');
			dispatch = run;
			return node('value', value);
		});
		const Scene = defineUniversalComponent(RENDERER, () =>
			universalTry(
				() => universalComponent(RENDERER, Child, universalProps([])),
				null,
				(error) => node('caught', (error as Error).message),
			),
		);
		const caught: unknown[] = [];
		const { container, root } = objectRoot({
			onCaughtError: (error) => caught.push(error),
		});

		root.render(Scene, undefined);
		expect(values(container)).toEqual({ value: 'idle' });
		dispatch(undefined);
		await drainMicrotasks();
		expect(values(container)).toEqual({ caught: 'action-fault' });
		expect(caught).toHaveLength(1);
		root.unmount();
	});

	it('publishes pending urgently when dispatched inside an in-flight async transition', async () => {
		const outer = deferred();
		const action = deferred<number>();
		let dispatch!: (payload: undefined) => void;
		const Counter = defineUniversalComponent(RENDERER, () => {
			const [count, run, pending] = useActionState<number, undefined>(() => action.promise, 0);
			dispatch = run;
			return [node('count', count), node('pending', pending)];
		});
		const { container, root } = objectRoot();

		root.render(Counter, undefined);
		startTransition(async () => {
			dispatch(undefined);
			await outer.promise;
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 0, pending: true });

		action.resolve(7);
		await drainMicrotasks();
		// The action's result is entangled with the transition it was dispatched
		// in, so it commits only once that outer action finishes too.
		expect(values(container)).toEqual({ count: 0, pending: true });

		outer.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 7, pending: false });
		root.unmount();
	});
});

// React 19 useOptimistic semantics on the host-neutral core: an optimistic
// action shows urgently, rebases onto every new passthrough, and reverts in the
// commit of the transition it was dispatched in. The DOM runtime's equivalents
// live in actions.test.ts.
describe('universal useOptimistic', () => {
	// Each layout-effect run is one commit of the owner. Consecutive equal values
	// collapse, so the list is the sequence of states a host could have shown.
	function shownStates(commits: readonly string[]): string[] {
		return commits.filter((value, index) => index === 0 || value !== commits[index - 1]);
	}

	it('shows an optimistic value while its async action is pending and reverts when it settles', async () => {
		const gate = deferred();
		let add!: (value: string) => void;
		const Label = defineUniversalComponent(RENDERER, (props: { value: string }) => {
			const [value, update] = useOptimistic(props.value);
			add = update;
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, { value: 'base' });
		startTransition(async () => {
			add('optimistic');
			await gate.promise;
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'optimistic' });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'base' });
		root.unmount();
	});

	it('associates an update dispatched after an await with the pending action', async () => {
		const gate = deferred();
		let add!: (value: string) => void;
		const Label = defineUniversalComponent(RENDERER, () => {
			const [value, update] = useOptimistic('base');
			add = update;
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, undefined);
		startTransition(async () => {
			await Promise.resolve();
			add('optimistic');
			await gate.promise;
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'optimistic' });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'base' });
		root.unmount();
	});

	it('reverts in the same commit that publishes the action result', async () => {
		const gate = deferred();
		const commits: string[] = [];
		let send!: (text: string) => void;
		const Thread = defineUniversalComponent(RENDERER, () => {
			const [messages, setMessages] = useState<readonly string[]>(['a']);
			const [shown, addOptimistic] = useOptimistic(
				messages,
				(list: readonly string[], text: string) => [...list, `${text}…`],
			);
			send = (text) =>
				startTransition(async () => {
					addOptimistic(text);
					await gate.promise;
					startTransition(() => setMessages((list) => [...list, text]));
				});
			useLayoutEffect(() => {
				commits.push(shown.join(','));
			}, null);
			return node('messages', shown.join(','));
		});
		const { container, root } = objectRoot();

		root.render(Thread, undefined);
		send('b');
		await drainMicrotasks();
		expect(values(container)).toEqual({ messages: 'a,b…' });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ messages: 'a,b' });
		// Never 'a,b,b…': the real message and the reverted optimistic one commit together.
		expect(shownStates(commits)).toEqual(['a', 'a,b…', 'a,b']);
		root.unmount();
	});

	it('rebases pending optimistic actions onto the latest passthrough', async () => {
		const gate = deferred();
		let add!: (amount: number) => void;
		const Counter = defineUniversalComponent(RENDERER, (props: { count: number }) => {
			const [count, update] = useOptimistic(
				props.count,
				(current: number, amount: number) => current + amount,
			);
			add = update;
			return node('count', count);
		});
		const { container, root } = objectRoot();

		root.render(Counter, { count: 0 });
		startTransition(async () => {
			add(1);
			add(2);
			await gate.promise;
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 3 });

		root.render(Counter, { count: 10 });
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 13 });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 10 });
		root.unmount();
	});

	it('applies a function action as an updater when no reducer is given', async () => {
		const gate = deferred();
		let add!: (action: number | ((pending: number) => number)) => void;
		const Counter = defineUniversalComponent(RENDERER, (props: { count: number }) => {
			const [count, update] = useOptimistic(props.count);
			add = update;
			return node('count', count);
		});
		const { container, root } = objectRoot();

		root.render(Counter, { count: 0 });
		startTransition(async () => {
			add((pending) => pending + 1);
			add((pending) => pending * 10);
			await gate.promise;
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 10 });

		root.render(Counter, { count: 2 });
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 30 });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ count: 2 });
		root.unmount();
	});

	it('reverts to the unchanged passthrough when the action fails', async () => {
		const gate = deferred();
		let add!: (value: string) => void;
		const Label = defineUniversalComponent(RENDERER, () => {
			const [value, update] = useOptimistic('saved');
			add = update;
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, undefined);
		startTransition(async () => {
			add('saving');
			await gate.promise;
			throw new Error('save failed');
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'saving' });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'saved' });
		root.unmount();
	});

	it('keeps the optimistic value while the transition that reverts it is suspended', async () => {
		const gate = deferred();
		const resource = deferred<string>();
		let submit!: () => void;
		const Scene = defineUniversalComponent(RENDERER, () => {
			const [source, setSource] = useState<Promise<string> | null>(null);
			const [label, addOptimistic] = useOptimistic('idle');
			submit = () =>
				startTransition(async () => {
					addOptimistic('saving');
					await gate.promise;
					startTransition(() => setSource(resource.promise));
				});
			return [
				node('label', label),
				universalTry(
					() => node('data', source === null ? 'none' : use(source)),
					() => node('fallback', 'loading'),
				),
			];
		});
		const { container, root } = objectRoot();

		root.render(Scene, undefined);
		submit();
		await drainMicrotasks();
		expect(values(container)).toEqual({ label: 'saving', data: 'none' });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ label: 'saving', data: 'none' });

		resource.resolve('loaded');
		await drainMicrotasks();
		expect(values(container)).toEqual({ label: 'idle', data: 'loaded' });
		root.unmount();
	});

	it('reverts in the same commit as the useActionState result it anticipates', async () => {
		const gate = deferred();
		const commits: string[] = [];
		let submit!: (text: string) => void;
		const Form = defineUniversalComponent(RENDERER, () => {
			const [saved, dispatch, pending] = useActionState<readonly string[], string>(
				async (previous, text) => {
					addOptimistic(text);
					await gate.promise;
					return [...previous, text];
				},
				[],
			);
			const [shown, addOptimistic] = useOptimistic(
				saved,
				(list: readonly string[], text: string) => [...list, `${text}…`],
			);
			submit = dispatch;
			useLayoutEffect(() => {
				commits.push(shown.join(','));
			}, null);
			return [node('shown', shown.join(',')), node('pending', pending)];
		});
		const { container, root } = objectRoot();

		root.render(Form, undefined);
		submit('a');
		await drainMicrotasks();
		expect(values(container)).toEqual({ shown: 'a…', pending: true });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ shown: 'a', pending: false });
		expect(shownStates(commits)).toEqual(['', 'a…', 'a']);
		root.unmount();
	});

	it('shows an update dispatched outside any transition once and then reverts it', async () => {
		const commits: string[] = [];
		let add!: (value: string) => void;
		const Label = defineUniversalComponent(RENDERER, () => {
			const [value, update] = useOptimistic('base');
			const [pending] = useTransition();
			add = update;
			useLayoutEffect(() => {
				commits.push(`${value}:${pending}`);
			}, null);
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, undefined);
		add('stray');
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'base' });
		// The revert is not a startTransition, so it never reports isPending.
		expect(shownStates(commits)).toEqual(['base:false', 'stray:false', 'base:false']);
		root.unmount();
	});

	it('reverts when the transition render that would have reverted it fails', async () => {
		const gate = deferred();
		const errors: string[] = [];
		let submit!: () => void;
		const Scene = defineUniversalComponent(RENDERER, () => {
			const [broken, setBroken] = useState(false);
			if (broken) throw new Error('render failed');
			const [label, addOptimistic] = useOptimistic('idle');
			submit = () =>
				startTransition(async () => {
					addOptimistic('saving');
					await gate.promise;
					startTransition(() => setBroken(true));
				});
			return node('label', label);
		});
		const { container, root } = objectRoot({
			onUncaughtError: (error) => errors.push((error as Error).message),
		});

		root.render(Scene, undefined);
		submit();
		await drainMicrotasks();
		expect(values(container)).toEqual({ label: 'saving' });

		gate.resolve();
		await drainMicrotasks();
		expect(errors).toEqual(['render failed']);
		expect(values(container)).toEqual({ label: 'idle' });
		root.unmount();
	});

	it('keeps one dispatcher across renders', async () => {
		const dispatchers = new Set<(value: string) => void>();
		const Label = defineUniversalComponent(RENDERER, (props: { value: string }) => {
			const [value, update] = useOptimistic(props.value);
			dispatchers.add(update);
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, { value: 'a' });
		root.render(Label, { value: 'b' });
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'b' });
		expect(dispatchers.size).toBe(1);
		root.unmount();
	});

	it('rejects an optimistic update dispatched while its component renders', () => {
		const Label = defineUniversalComponent(RENDERER, () => {
			const [value, update] = useOptimistic('base');
			if (value === 'base') update('optimistic');
			return node('value', value);
		});
		const { root } = objectRoot();

		expect(() => root.render(Label, undefined)).toThrow(
			'Cannot update optimistic state while rendering.',
		);
		root.unmount();
	});

	it('accepts an optimistic update dispatched from a layout effect', async () => {
		const gate = deferred();
		const Label = defineUniversalComponent(RENDERER, () => {
			const [value, update] = useOptimistic('base');
			useLayoutEffect(() => {
				startTransition(async () => {
					update('optimistic');
					await gate.promise;
				});
			}, []);
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, undefined);
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'optimistic' });

		gate.resolve();
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'base' });
		root.unmount();
	});

	it('drops pending optimistic state when its owner unmounts before the action settles', async () => {
		const gate = deferred();
		let add!: (value: string) => void;
		const Label = defineUniversalComponent(RENDERER, () => {
			const [value, update] = useOptimistic('base');
			add = update;
			return node('value', value);
		});
		const { container, root } = objectRoot();

		root.render(Label, undefined);
		startTransition(async () => {
			add('optimistic');
			await gate.promise;
		});
		await drainMicrotasks();
		expect(values(container)).toEqual({ value: 'optimistic' });
		root.unmount();

		gate.resolve();
		await drainMicrotasks();
		expect(() => add('late')).not.toThrow();
		await drainMicrotasks();
		expect(container.children).toEqual([]);
	});
});
