import type { UniversalHostBatch, UniversalHostDriver } from 'octane/universal/native';
import {
	createUniversalRoot,
	defineUniversalComponent as defineBackgroundUniversalComponent,
	use as useBackground,
	useId as useBackgroundId,
	type UniversalComponent,
	type UniversalHostCommitContext,
} from 'octane/universal/native';
import { describe, expect, it, vi } from 'vitest';
import { createLynxNativeResource } from '../src/first-screen.js';
import {
	createContext,
	defineUniversalComponent,
	firstScreenEvent,
	hmrUniversalComponent,
	lazy,
	renderLynxFirstScreen,
	UNIVERSAL_HMR,
	universalComponent,
	universalContext,
	universalActivity,
	universalFor,
	universalIf,
	universalPlan,
	universalProps,
	universalSwitch,
	universalTry,
	universalValue,
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	use,
	useBatch,
	warmChild,
} from '../src/main-renderer.js';

interface CapturedContainer {
	batch: UniversalHostBatch | null;
}

function captureBackgroundBatch<Props>(
	component: UniversalComponent<Props>,
	props: Props,
): UniversalHostBatch {
	const container: CapturedContainer = { batch: null };
	const driver: UniversalHostDriver<CapturedContainer> = {
		id: 'lynx',
		capabilities: { text: 'host', visibility: true },
		events: {
			classify(name) {
				const match = /^(?:capture-bind|capture-catch|global-bind|bind|catch)([A-Za-z]+)$/.exec(
					name,
				);
				if (match === null) return null;
				return {
					type: name,
					priority: match[1] === 'tap' ? 'discrete' : 'default',
				};
			},
		},
		prepareBatch(
			target: CapturedContainer,
			batch: UniversalHostBatch,
			_context: UniversalHostCommitContext,
		) {
			return {
				apply() {
					target.batch = batch;
				},
				abort() {},
			};
		},
		getPublicInstance() {
			return null;
		},
	};
	createUniversalRoot(container, driver, { scheduleMicrotask: (callback) => callback() }).render(
		component,
		props,
	);
	if (container.batch === null) throw new Error('Background root did not commit.');
	return container.batch;
}

function normalizeRootScopedUseId(batch: UniversalHostBatch, id: string): unknown {
	return {
		...batch,
		commands: batch.commands.map((command) =>
			command.op === 'create' && command.props.id === id
				? { ...command, props: { ...command.props, id: '<committed-use-id>' } }
				: command,
		),
	};
}

const leafPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'text',
	propsSlot: 0,
	children: [{ kind: 'text', slot: 1 }],
});

const rowPlan = universalPlan('lynx', {
	kind: 'host',
	type: 'view',
	propsSlot: 0,
});

const Child = defineUniversalComponent('lynx', (props: { readonly value: string }) =>
	universalValue(leafPlan, [universalProps([['set', 'id', 'label']]), props.value]),
);

const Scene = defineUniversalComponent(
	'lynx',
	(props: {
		readonly handler: () => void;
		readonly items: readonly string[];
		readonly title: string;
	}) => [
		universalComponent('lynx', Child, universalProps([['set', 'value', props.title]])),
		universalFor(
			props.items,
			(item) => item,
			(item) =>
				universalValue(rowPlan, [
					universalProps([
						['set', 'id', item],
						['set', 'bindtap', props.handler],
					]),
				]),
		),
	],
);

describe('Lynx main-thread first-screen renderer', () => {
	it('keeps the first-screen wrapper stable while accepting a replacement implementation', () => {
		const First = defineUniversalComponent('lynx', () =>
			universalValue(rowPlan, [universalProps([['set', 'version', 'first']])]),
		);
		const Second = defineUniversalComponent('lynx', () =>
			universalValue(rowPlan, [universalProps([['set', 'version', 'second']])]),
		);
		const firstWarm = () => undefined;
		const secondWarm = () => undefined;
		(First as any).__warm = firstWarm;
		(Second as any).__warm = secondWarm;
		const Reloadable = hmrUniversalComponent('lynx', First);
		const identity = Reloadable;
		expect((Reloadable as any).__warm).toBe(firstWarm);

		(Reloadable as any)[UNIVERSAL_HMR].update(hmrUniversalComponent('lynx', Second));

		expect(Reloadable).toBe(identity);
		expect((Reloadable as any).__warm).toBe(secondWarm);
		expect(renderLynxFirstScreen(Reloadable, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { version: 'second' },
		});
	});

	it('commits an authored pending arm while a lazy chunk loads and reuses the cached module', async () => {
		const Loaded = defineUniversalComponent('lynx', (props: { label: string }) =>
			universalValue(rowPlan, [
				universalProps([
					['set', 'state', 'loaded'],
					['set', 'label', props.label],
				]),
			]),
		);
		let resolve!: (module: { default: typeof Loaded }) => void;
		const module = new Promise<{ default: typeof Loaded }>((done) => {
			resolve = done;
		});
		let loads = 0;
		const Lazy = lazy(() => {
			loads++;
			return module;
		});
		const Boundary = defineUniversalComponent('lynx', () =>
			universalTry(
				() => universalComponent('lynx', Lazy, { label: 'native chunk' }),
				() => universalValue(rowPlan, [universalProps([['set', 'state', 'pending']])]),
			),
		);

		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { state: 'pending' },
		});
		expect(loads).toBe(1);

		resolve({ default: Loaded });
		await module;
		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { label: 'native chunk', state: 'loaded' },
		});
		expect(loads).toBe(1);
	});

	it('caches a rejected lazy chunk and routes the error through the authored catch arm', async () => {
		let reject!: (error: Error) => void;
		const module = new Promise<never>((_resolve, fail) => {
			reject = fail;
		});
		let loads = 0;
		const Lazy = lazy(() => {
			loads++;
			return module;
		});
		const Boundary = defineUniversalComponent('lynx', () =>
			universalTry(
				() => universalComponent('lynx', Lazy),
				() => universalValue(rowPlan, [universalProps([['set', 'state', 'pending']])]),
				(error) =>
					universalValue(rowPlan, [
						universalProps([
							['set', 'state', 'caught'],
							['set', 'message', (error as Error).message],
						]),
					]),
			),
		);

		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { state: 'pending' },
		});
		reject(new Error('native chunk failed'));
		await module.catch(() => undefined);

		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { message: 'native chunk failed', state: 'caught' },
		});
		expect(loads).toBe(1);
	});

	it('rejects a lazy module compiled for another renderer', () => {
		const Foreign = defineBackgroundUniversalComponent('object', () => null);
		const Lazy = lazy(
			() =>
				({
					then(resolve: (module: { default: typeof Foreign }) => void) {
						resolve({ default: Foreign });
					},
				}) as PromiseLike<{ default: any }>,
		);
		const Boundary = defineUniversalComponent('lynx', () =>
			universalTry(
				() => universalComponent('lynx', Lazy),
				null,
				(error) =>
					universalValue(rowPlan, [universalProps([['set', 'message', (error as Error).message]])]),
			),
		);

		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { message: 'Universal lazy for renderer "lynx" cannot render component "object".' },
		});
	});

	it('starts independent lazy chunks before committing their shared pending arm', () => {
		const calls: string[] = [];
		const pending = () => new Promise<never>(() => {});
		const Left = lazy(() => {
			calls.push('left');
			return pending();
		});
		const Right = lazy(() => {
			calls.push('right');
			return pending();
		});
		const Boundary = defineUniversalComponent('lynx', () => {
			useBatch([], () => {
				warmChild(Left, {});
				warmChild(Right, {});
			});
			return universalTry(
				() => [universalComponent('lynx', Left), universalComponent('lynx', Right)],
				() => universalValue(rowPlan, [universalProps([['set', 'state', 'pending']])]),
			);
		});

		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { state: 'pending' },
		});
		expect(calls).toHaveLength(2);
		expect(new Set(calls)).toEqual(new Set(['left', 'right']));
	});

	it('passes compiler warm-plan props through nested lazy children', () => {
		const calls: string[] = [];
		const pending = () => new Promise<never>(() => {});
		const Left = lazy(() => {
			calls.push('left');
			return pending();
		});
		const Right = lazy(() => {
			calls.push('right');
			return pending();
		});
		const Branch = defineUniversalComponent(
			'lynx',
			(props: { child: UniversalComponent<any>; childProps: Record<string, unknown> }) =>
				universalComponent('lynx', props.child, props.childProps),
		);
		(Branch as any).__warm = (props: {
			child: UniversalComponent<any>;
			childProps: Record<string, unknown>;
		}) => warmChild(props.child, props.childProps);
		const branchProps = { child: Right, childProps: { label: 'right' } };
		const Boundary = defineUniversalComponent('lynx', () => {
			useBatch([], () => warmChild(Branch, branchProps));
			return universalTry(
				() => [universalComponent('lynx', Left), universalComponent('lynx', Branch, branchProps)],
				() => universalValue(rowPlan, [universalProps([['set', 'state', 'pending']])]),
			);
		});

		expect(renderLynxFirstScreen(Boundary, {}).batch.commands[0]).toMatchObject({
			op: 'create',
			props: { state: 'pending' },
		});
		expect(calls).toEqual(['left', 'right']);
	});

	it('diagnoses pending lazy content that has no authored first-screen boundary', () => {
		const Lazy = lazy(() => new Promise<never>(() => {}));
		const Unbounded = defineUniversalComponent('lynx', () => universalComponent('lynx', Lazy));

		expect(() => renderLynxFirstScreen(Unbounded, {})).toThrow(
			/suspended without an authored @pending boundary.*cannot wait for lazy chunks/,
		);
	});

	it('emits the same initial host IDs, topology, props, and listener metadata as background', () => {
		const props = {
			handler: () => {},
			items: ['a', 'b'],
			title: 'Hello',
		};
		const main = renderLynxFirstScreen(Scene, props);
		const background = captureBackgroundBatch(Scene, props);

		expect(main.batch).toEqual(background);
		expect(main.hostCount).toBe(4);
		expect(main.logicalCount).toBeGreaterThan(main.hostCount);
		expect(main.batch.commands.some((command) => 'props' in command && command.props.bindtap)).toBe(
			false,
		);
	});

	it('matches background range IDs for production-compiled ownerless leaf loops', () => {
		const ProductionLeafLoop = defineUniversalComponent(
			'lynx',
			(props: { readonly items: readonly string[] }) =>
				universalFor(
					props.items,
					(item) => item,
					(item) => universalValue(rowPlan, [universalProps([['set', 'id', item]])]),
					null,
					true,
					true,
				),
		);
		const props = { items: ['a', 'b'] };
		const main = renderLynxFirstScreen(ProductionLeafLoop, props);
		const background = captureBackgroundBatch(ProductionLeafLoop, props);

		// A production compile emits the two trailing `true` hints for this leaf
		// shape. Lynx does not advertise compilerLeafProps, so both runtimes must
		// preserve the per-item ranges and therefore allocate host IDs 2 and 4.
		expect(main.batch).toEqual(background);
		expect(
			main.batch.commands.filter((command) => command.op === 'create').map((command) => command.id),
		).toEqual([2, 4]);
		expect(main.logicalCount).toBe(4);
	});

	it('recognizes the compiler sentinel without retaining an authored callback', () => {
		const EventOnly = defineUniversalComponent('lynx', () =>
			universalValue(rowPlan, [universalProps([['set', 'bindtap', firstScreenEvent]])]),
		);
		const result = renderLynxFirstScreen(EventOnly, {});

		expect(result.batch.commands).toEqual([
			{ op: 'create', id: 1, type: 'view', props: {} },
			{
				op: 'event',
				id: 1,
				type: 'bindtap',
				listener: { id: 1_000_000, priority: 'discrete' },
			},
			{ op: 'insert', parent: null, id: 1, before: null },
		]);
	});

	it('uses initial hook values and never publishes effects, refs, or updates', () => {
		const effect = vi.fn();
		const layout = vi.fn();
		const ref = vi.fn();
		const Hooks = defineUniversalComponent('lynx', () => {
			const [count, setCount] = useState(2);
			const localRef = useRef('private');
			useEffect(effect);
			useLayoutEffect(layout);
			setCount(9);
			return universalValue(leafPlan, [
				universalProps([
					['set', 'id', useId()],
					['set', 'ref', ref],
				]),
				`${localRef.current}:${count}`,
			]);
		});

		const result = renderLynxFirstScreen(Hooks, {});
		expect(result.batch.commands).toContainEqual({
			op: 'create',
			id: 1,
			type: 'text',
			props: { id: ':octane-u4:' },
		});
		expect(result.batch.commands).toContainEqual({
			op: 'create',
			id: 2,
			type: '#text',
			props: { value: 'private:2' },
		});
		expect(effect).not.toHaveBeenCalled();
		expect(layout).not.toHaveBeenCalled();
		expect(ref).not.toHaveBeenCalled();
	});

	it('reclaims useId allocations from discarded try arms before committing a fallback', () => {
		const never = new Promise<never>(() => {});
		for (const discard of ['error', 'suspend'] as const) {
			let discardedMainId = '';
			const MainBoundary = defineUniversalComponent('lynx', () =>
				universalTry(
					() => {
						discardedMainId = useId();
						if (discard === 'error') throw new Error('discard main try arm');
						use(never);
					},
					() => universalValue(rowPlan, [universalProps([['set', 'id', useId()]])]),
					() => universalValue(rowPlan, [universalProps([['set', 'id', useId()]])]),
				),
			);
			let discardedBackgroundId = '';
			const BackgroundBoundary = defineUniversalComponent('lynx', () =>
				universalTry(
					() => {
						discardedBackgroundId = useBackgroundId('discarded-arm-id');
						if (discard === 'error') throw new Error('discard background try arm');
						useBackground(never);
					},
					() =>
						universalValue(rowPlan, [
							universalProps([['set', 'id', useBackgroundId('committed-pending-id')]]),
						]),
					() =>
						universalValue(rowPlan, [
							universalProps([['set', 'id', useBackgroundId('committed-catch-id')]]),
						]),
				),
			);

			const main = renderLynxFirstScreen(MainBoundary, {}).batch;
			const background = captureBackgroundBatch(BackgroundBoundary, {});
			const mainCreate = main.commands.find((command) => command.op === 'create');
			const backgroundCreate = background.commands.find((command) => command.op === 'create');
			if (mainCreate?.op !== 'create' || backgroundCreate?.op !== 'create') {
				throw new Error('Expected both try fallbacks to create a host.');
			}
			expect(mainCreate.props.id).toBe(discardedMainId);
			expect(backgroundCreate.props.id).toBe(discardedBackgroundId);
			expect(normalizeRootScopedUseId(main, discardedMainId)).toEqual(
				normalizeRootScopedUseId(background, discardedBackgroundId),
			);
		}
	});

	it('rejects background-scoped native resource props before emitting a first-screen batch', () => {
		const NativeResource = defineUniversalComponent('lynx', () =>
			universalValue(rowPlan, [
				universalProps([['set', 'texture', createLynxNativeResource('hero')]]),
			]),
		);

		expect(() => renderLynxFirstScreen(NativeResource, {})).toThrow(
			/native resource prop "texture".*background-only/,
		);
	});

	it('renders context, keyed control flow, caught errors, and pending fallbacks deterministically', () => {
		const Context = createContext('default');
		const Read = defineUniversalComponent('lynx', () =>
			universalValue(leafPlan, [universalProps([]), useContext(Context)]),
		);
		const pending = new Promise<void>(() => {});
		const Boundary = defineUniversalComponent('lynx', () =>
			universalContext(Context, 'provided', [
				universalTry(
					() => {
						use(pending);
						return null;
					},
					() => universalComponent('lynx', Read),
				),
				universalTry(
					() => {
						throw new Error('expected');
					},
					null,
					() => universalValue(leafPlan, [universalProps([]), 'caught']),
				),
			]),
		);

		const result = renderLynxFirstScreen(Boundary, {});
		const creates = result.batch.commands.filter((command) => command.op === 'create');
		expect(
			creates.filter((command) => command.type === '#text').map((command) => command.props),
		).toEqual([{ value: 'provided' }, { value: 'caught' }]);
	});

	it('starts every pending member in a compiler-batched suspension stratum', () => {
		const first = new Promise<void>(() => {}) as Promise<void> & { status?: string };
		const second = new Promise<void>(() => {}) as Promise<void> & { status?: string };
		const Batched = defineUniversalComponent('lynx', () =>
			universalTry(
				() => {
					useBatch([first, second]);
					use(first);
					return null;
				},
				() => universalValue(leafPlan, [universalProps([]), 'pending']),
			),
		);

		const result = renderLynxFirstScreen(Batched, {});
		expect(first.status).toBe('pending');
		expect(second.status).toBe('pending');
		expect(result.batch.commands).toContainEqual({
			op: 'create',
			id: 4,
			type: '#text',
			props: { value: 'pending' },
		});
	});

	it('matches background IDs and topology through early and directive control flow', () => {
		const ControlFlow = defineUniversalComponent(
			'lynx',
			(props: { show: boolean; branch: string; fail: boolean }) => {
				if (!props.show) return null;
				return [
					universalIf(true, () => universalValue(rowPlan, [universalProps([['set', 'id', 'if']])])),
					universalSwitch(
						props.branch,
						[['a', () => universalValue(rowPlan, [universalProps([['set', 'id', 'case']])])]],
						() => universalValue(rowPlan, [universalProps([['set', 'id', 'default']])]),
					),
					universalTry(
						() => {
							if (props.fail) throw new Error('expected');
							return universalValue(rowPlan, [universalProps([['set', 'id', 'body']])]);
						},
						null,
						() => universalValue(rowPlan, [universalProps([['set', 'id', 'catch']])]),
					),
					universalActivity('hidden', () =>
						universalValue(rowPlan, [universalProps([['set', 'id', 'hidden']])]),
					),
				];
			},
		);

		for (const props of [
			{ show: false, branch: 'a', fail: false },
			{ show: true, branch: 'a', fail: false },
			{ show: true, branch: 'other', fail: true },
		]) {
			expect(renderLynxFirstScreen(ControlFlow, props).batch).toEqual(
				captureBackgroundBatch(ControlFlow, props),
			);
		}
	});

	it('accepts conditional initial hooks without retaining an update path', () => {
		const ConditionalHooks = defineUniversalComponent('lynx', (props: { enabled: boolean }) => {
			if (!props.enabled) return null;
			const [value, update] = useState('initial');
			update('ignored');
			return universalValue(leafPlan, [universalProps([]), value]);
		});

		expect(renderLynxFirstScreen(ConditionalHooks, { enabled: false }).batch.commands).toEqual([]);
		expect(
			renderLynxFirstScreen(ConditionalHooks, { enabled: true }).batch.commands,
		).toContainEqual({
			op: 'create',
			id: 2,
			type: '#text',
			props: { value: 'initial' },
		});
	});
});
