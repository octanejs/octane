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
	useState,
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
