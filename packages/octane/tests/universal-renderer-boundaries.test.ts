import { describe, expect, it, vi } from 'vitest';
import { createRoot, flushSync, type ComponentBody } from '../src/index.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	isRendererRegion,
	rendererRegion,
	startTransition,
	universalContext,
	universalPlan,
	universalTry,
	universalValue,
	use,
	useContext,
	useLayoutEffect,
	useState,
	useTransition,
	type RendererRegion,
} from '../src/universal.js';
import { mount } from './_helpers.js';
import {
	AbandonedBoundaryApp,
	InlineAlternatingBoundaryApp,
	MixedBoundaryApp,
} from './_fixtures/universal-mixed-boundaries.tsrx';
import { ReverseScene } from './_fixtures/universal-mixed-scene.object.tsrx';
import { ReverseOwnerDom } from './_fixtures/universal-reverse-owner.tsrx';
import { OwnedCanvasApp } from './_fixtures/universal-owned-canvas-app.tsrx';
import { getOwnedCanvasContainer } from './_fixtures/universal-owned-canvas.tsrx';
import {
	PreparedThenSiblingBoundaryApp,
	ProjectedBoundaryApp,
	SequentialProjectedBoundaryApp,
} from './_fixtures/universal-projected-boundary.tsrx';
import { Canvas } from './_fixtures/universal-renderer-boundaries.tsrx';
import {
	UniversalBoundaryFixture,
	UniversalPendingBoundaryFixture,
	UniversalSchedulerBridgeApp,
	UniversalTheme,
} from './_fixtures/universal-boundary.tsrx';

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function controlledObjectRoot() {
	const container = createObjectContainer();
	const scheduled: Array<() => void> = [];
	const root = createUniversalRoot(container, createObjectDriver(), {
		scheduleMicrotask(callback) {
			scheduled.push(callback);
		},
	});
	return { container, root, scheduled };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((accept) => {
		resolve = accept;
	});
	return { promise, resolve };
}

function fulfilled<T>(value: T): Promise<T> {
	return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
}

interface ReverseOwnerProps {
	theme: unknown;
	log: (entry: string) => void;
	version?: number;
	error?: boolean;
	thenable?: PromiseLike<unknown>;
	throwCleanup?: boolean;
	hostRef?: (value: unknown) => void;
	capture?: (region: RendererRegion) => void;
	captureUpdate?: (update: (value: number) => void) => void;
}

const reverseRegionPlan = universalPlan('object', {
	kind: 'host',
	type: 'html-region',
	bindings: [['region', 0]],
});
const reverseStatusPlan = universalPlan('object', {
	kind: 'host',
	type: 'status',
	bindings: [['value', 0]],
});
const ReverseOwnerScene = defineUniversalComponent('object', (props: ReverseOwnerProps) =>
	universalContext(UniversalTheme, props.theme as string, () =>
		universalTry(
			() => {
				const [count, setCount] = useState(0, 'reverse-owner-count');
				props.captureUpdate?.(setCount);
				const region = rendererRegion('object', 'dom', ReverseOwnerDom, {
					log: props.log,
					version: props.version ?? 0,
					error: props.error,
					thenable: props.thenable,
					throwCleanup: props.throwCleanup,
					hostRef: props.hostRef,
					count,
				});
				props.capture?.(region);
				return universalValue(reverseRegionPlan, [region]);
			},
			() => universalValue(reverseStatusPlan, ['pending']),
			(error) => universalValue(reverseStatusPlan, [`caught:${(error as Error).message}`]),
		),
	),
);

interface ReverseProviderTopologyProps extends ReverseOwnerProps {
	provided: boolean;
}

const ReverseProviderTopologyScene = defineUniversalComponent(
	'object',
	(props: ReverseProviderTopologyProps) => {
		const renderRegion = () => {
			const region = rendererRegion('object', 'dom', ReverseOwnerDom, {
				log: props.log,
				version: props.version ?? 0,
			});
			props.capture?.(region);
			return universalValue(reverseRegionPlan, [region]);
		};
		return props.provided
			? universalContext(UniversalTheme, props.theme as string, renderRegion)
			: renderRegion();
	},
);

function committedDomRegion(
	container: ReturnType<typeof createObjectContainer>,
): RendererRegion<any> {
	const region = container.children[0]?.props.region;
	if (!isRendererRegion(region)) throw new Error('expected a committed DOM renderer region');
	return region;
}

async function flushBridgeWork(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe('compiler-owned renderer child regions', () => {
	it('settles direct and DOM-owned universal cascades in one host scheduler boundary', () => {
		const direct = objectRoot();
		const bridged = objectRoot();
		const directPlan = universalPlan('object', {
			kind: 'host',
			type: 'direct',
			bindings: [['value', 0]],
		});
		const bridgedPlan = universalPlan('object', {
			kind: 'host',
			type: 'bridged',
			bindings: [['version', 0]],
		});
		let setDirect!: (value: number) => void;
		let setDomVersion!: (value: number) => void;
		const DirectScene = defineUniversalComponent('object', () => {
			const [value, updateValue] = useState(0, 'direct-state');
			setDirect = updateValue;
			useLayoutEffect(
				() => {
					if (value === 1) setDomVersion(1);
				},
				[value],
				'direct-layout',
			);
			return universalValue(directPlan, [value]);
		});
		const BridgedScene = defineUniversalComponent<{
			version: number;
			onLayout: (version: number) => void;
		}>('object', (props) => {
			useLayoutEffect(
				() => props.onLayout(props.version),
				[props.onLayout, props.version],
				'bridged-layout',
			);
			return universalValue(bridgedPlan, [props.version]);
		});

		direct.root.render(DirectScene, undefined);
		const mounted = mount(UniversalSchedulerBridgeApp, {
			root: bridged.root,
			component: BridgedScene,
			captureUpdate(update: (value: number) => void) {
				setDomVersion = update;
			},
			onUniversalLayout(version: number) {
				if (version === 1) setDirect(2);
			},
		});

		const result = flushUniversalSync(() => {
			setDirect(1);
			return 'settled';
		}, flushSync);

		expect(result).toBe('settled');
		expect(direct.container.children[0].props.value).toBe(2);
		expect(bridged.container.children[0].props.version).toBe(1);

		mounted.unmount();
		direct.root.unmount();
	});

	it('keeps coalesced DOM prop updates urgent while bridged transition work suspends', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const bridgedPlan = universalPlan('object', {
			kind: 'host',
			type: 'bridged',
			bindings: [
				['version', 0],
				['value', 1],
			],
		});
		let setDomVersion!: (value: number) => void;
		let begin!: () => void;
		const BridgedScene = defineUniversalComponent<{
			version: number;
			onLayout: (version: number) => void;
		}>('object', (props) => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			begin = () => startTransition(() => setResource(second.promise));
			return universalValue(bridgedPlan, [props.version, use(resource)]);
		});
		const bridged = controlledObjectRoot();
		const mounted = mount(UniversalSchedulerBridgeApp, {
			root: bridged.root,
			component: BridgedScene,
			captureUpdate(update: (value: number) => void) {
				setDomVersion = update;
			},
			onUniversalLayout() {},
		});
		while (bridged.scheduled.length > 0) bridged.scheduled.shift()!();

		begin();
		expect(bridged.scheduled).toHaveLength(1);
		flushSync(() => {
			bridged.scheduled.shift()!();
			setDomVersion(1);
		});
		expect(bridged.container.children[0].props).toMatchObject({ version: 1, value: 'first' });

		second.resolve('second');
		await flushBridgeWork();
		flushSync(() => {});
		expect(bridged.container.children[0].props).toMatchObject({ version: 1, value: 'second' });
		mounted.unmount();
	});

	it('keeps coalesced DOM context updates urgent while bridged transition work suspends', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const childProps = {};
		const bridgedPlan = universalPlan('object', {
			kind: 'host',
			type: 'bridged',
			bindings: [
				['theme', 0],
				['value', 1],
			],
		});
		let begin!: () => void;
		const BridgedScene = defineUniversalComponent('object', () => {
			const [resource, setResource] = useState<Promise<string>>(first, 'resource');
			begin = () => startTransition(() => setResource(second.promise));
			return universalValue(bridgedPlan, [useContext(UniversalTheme), use(resource)]);
		});
		const bridged = controlledObjectRoot();
		const initialProps = {
			root: bridged.root,
			component: BridgedScene,
			childProps,
			theme: 'light',
			log() {},
			failAfterPrepare: false,
		};
		const mounted = mount(UniversalBoundaryFixture, initialProps);
		while (bridged.scheduled.length > 0) bridged.scheduled.shift()!();

		begin();
		expect(bridged.scheduled).toHaveLength(1);
		flushSync(() => {
			bridged.scheduled.shift()!();
			mounted.root.render(UniversalBoundaryFixture, { ...initialProps, theme: 'dark' });
		});
		expect(bridged.container.children[0].props).toMatchObject({ theme: 'dark', value: 'first' });

		second.resolve('second');
		await flushBridgeWork();
		flushSync(() => {});
		expect(bridged.container.children[0].props).toMatchObject({ theme: 'dark', value: 'second' });
		mounted.unmount();
	});

	it('keeps an urgent DOM pending projection visible across bridged transition invalidation', async () => {
		const first = fulfilled('first');
		const second = deferred<string>();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'bridged',
			bindings: [
				['value', 0],
				['count', 1],
			],
		});
		let begin!: () => void;
		const BridgedScene = defineUniversalComponent<{
			resource: Promise<string>;
		}>('object', (props) => {
			const [count, setCount] = useState(0, 'count');
			begin = () => startTransition(() => setCount(1));
			return universalValue(plan, [use(props.resource), count]);
		});
		const bridged = controlledObjectRoot();
		const mounted = mount(UniversalPendingBoundaryFixture, {
			root: bridged.root,
			component: BridgedScene,
			childProps: { resource: first },
		});
		while (bridged.scheduled.length > 0) bridged.scheduled.shift()!();

		mounted.update(UniversalPendingBoundaryFixture, {
			root: bridged.root,
			component: BridgedScene,
			childProps: { resource: second.promise },
		});
		expect(mounted.find('.projected-pending').textContent).toBe('pending');

		begin();
		expect(bridged.scheduled.length).toBeGreaterThanOrEqual(2);
		bridged.scheduled.shift()!(); // Abandon the root attempt after the DOM fallback owns retry.
		flushSync(() => bridged.scheduled.shift()!()); // Promotion must preserve that projection.
		expect(mounted.find('.projected-pending').textContent).toBe('pending');
		expect(bridged.container.children[0].props).toMatchObject({ value: 'first', count: 0 });

		second.resolve('second');
		await flushBridgeWork();
		flushSync(() => {});
		expect(mounted.container.querySelector('.projected-pending')).toBeNull();
		expect(bridged.container.children[0].props).toMatchObject({ value: 'second', count: 1 });

		mounted.unmount();
		expect(bridged.container.children).toEqual([]);
		const Probe = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return universalValue(plan, ['probe', pending]);
		});
		const probe = objectRoot();
		probe.root.render(Probe, undefined);
		expect(probe.container.children[0].props.count).toBe(false);
		probe.root.unmount();
	});

	it('projects an initial host suspension and clears its abandoned owner bridge', async () => {
		const { container, root } = objectRoot();
		const never = new Promise<string>(() => {});
		const suspended = mount(ProjectedBoundaryApp, { root, resource: never });
		expect(suspended.find('.projected-pending').textContent).toBe('pending');
		expect(container.children).toEqual([]);

		await flushBridgeWork();
		suspended.unmount();

		const ready = {
			status: 'fulfilled' as const,
			value: 'ready after abandon',
			then() {},
		};
		const remounted = mount(ProjectedBoundaryApp, { root, resource: ready });
		expect(remounted.container.querySelector('.projected-pending')).toBeNull();
		expect(container.children).toHaveLength(1);
		expect(container.children[0].props.value).toBe('ready after abandon');

		remounted.unmount();
		expect(container.children).toEqual([]);
	});

	it('retains a committed host root and accepts newer props while an older suspension is pending', async () => {
		const { container, root } = objectRoot();
		const ready = {
			status: 'fulfilled' as const,
			value: 'first',
			then() {},
		};
		const mounted = mount(ProjectedBoundaryApp, { root, resource: ready });
		const scene = container.children[0];
		expect(scene.props.value).toBe('first');

		const obsolete = new Promise<string>(() => {});
		mounted.update(ProjectedBoundaryApp, { root, resource: obsolete });
		expect(mounted.find('.projected-pending').textContent).toBe('pending');
		expect(container.children).toEqual([scene]);

		const latest = {
			status: 'fulfilled' as const,
			value: 'latest',
			then() {},
		};
		mounted.update(ProjectedBoundaryApp, { root, resource: latest });
		await flushBridgeWork();
		expect(mounted.container.querySelector('.projected-pending')).toBeNull();
		expect(container.children).toEqual([scene]);
		expect(scene.props.value).toBe('latest');

		mounted.unmount();
		expect(container.children).toEqual([]);
	});

	it('keeps the DOM fallback visible across sequential projected suspensions', async () => {
		const { container, root } = objectRoot();
		let resolveFirst!: (value: string) => void;
		let resolveSecond!: (value: string) => void;
		const first = new Promise<string>((resolve) => {
			resolveFirst = resolve;
		});
		const second = new Promise<string>((resolve) => {
			resolveSecond = resolve;
		});
		const secondFor = vi.fn(() => second);
		const mounted = mount(SequentialProjectedBoundaryApp, { root, first, secondFor });

		expect(mounted.find('.projected-pending').textContent).toBe('pending');
		expect(container.children).toEqual([]);

		resolveFirst('asset-key');
		await first;
		await flushBridgeWork();
		expect(secondFor).toHaveBeenCalledWith('asset-key');
		expect(mounted.find('.projected-pending').textContent).toBe('pending');
		expect(container.children).toEqual([]);

		resolveSecond('sequential asset ready');
		await second;
		await flushBridgeWork();
		expect(mounted.container.querySelector('.projected-pending')).toBeNull();
		expect(container.children).toHaveLength(1);
		expect(container.children[0].props.value).toBe('sequential asset ready');

		mounted.unmount();
		expect(container.children).toEqual([]);
	});

	it('retains one boundary owner when a later DOM sibling suspends before layout', async () => {
		const { container, root } = objectRoot();
		let resolve!: (value: string) => void;
		const resource = new Promise<string>((done) => {
			resolve = done;
		});
		const mounted = mount(PreparedThenSiblingBoundaryApp, {
			root,
			resource,
			value: 'prepared before sibling',
		});

		expect(mounted.find('.projected-pending').textContent).toBe('pending');
		expect(container.children).toEqual([]);
		await flushBridgeWork();

		resolve('sibling ready');
		await resource;
		await flushBridgeWork();
		expect(mounted.container.querySelector('.projected-pending')).toBeNull();
		expect(mounted.find('.projected-sibling').textContent).toBe('sibling ready');
		expect(container.children).toHaveLength(1);
		expect(container.children[0].props.value).toBe('prepared before sibling');

		mounted.unmount();
		expect(container.children).toEqual([]);
	});

	it('rejects replacing a hidden boundary root after its insertion lifetime commits', async () => {
		const first = objectRoot();
		const second = objectRoot();
		const resource = new Promise<string>(() => {});
		const mounted = mount(PreparedThenSiblingBoundaryApp, {
			root: first.root,
			resource,
			value: 'first root',
		});

		expect(mounted.find('.projected-pending').textContent).toBe('pending');
		await flushBridgeWork();
		mounted.update(PreparedThenSiblingBoundaryApp, {
			root: second.root,
			resource,
			value: 'replacement root',
		});

		expect(mounted.find('.projected-error').textContent).toBe(
			'Changing the root owned by a mounted universal boundary is not supported.',
		);
		expect(first.container.children).toEqual([]);
		expect(second.container.children).toEqual([]);
		mounted.unmount();
	});

	it('executes the package-facing Canvas authoring form with an owned root', () => {
		const mounted = mount(OwnedCanvasApp);
		const canvas = mounted.find('.owned-object-canvas');
		const container = getOwnedCanvasContainer(canvas);

		expect(container.children.map((child) => child.type)).toEqual(['scene', 'mesh']);
		expect(container.commits).toHaveLength(1);

		mounted.unmount();
		expect(container.children).toEqual([]);
		expect(container.commits).toHaveLength(2);
	});

	it('executes Canvas children through a universal root while preserving DOM ownership', async () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const refs: unknown[] = [];
		const hostRef = (value: unknown) => refs.push(value);
		const mounted = mount(MixedBoundaryApp, {
			root,
			theme: 'dark',
			log: (entry: string) => log.push(entry),
			hostRef,
		});

		expect(mounted.html()).toBe('<!--comp--><!--/comp-->');
		expect(container.children.map((child) => child.type)).toEqual(['scene', 'mesh']);
		const scene = container.children[0];
		expect(scene.props).toMatchObject({ theme: 'dark', count: 0 });
		expect(container.children[1].props).toEqual({ kind: 'inline' });
		expect(refs).toEqual([scene]);
		expect(log).toEqual(['scene-layout:dark:0']);
		expect(container.commits).toHaveLength(1);

		container.dispatchEvent(scene, 'select', { delta: 2 });
		await Promise.resolve();
		await Promise.resolve();
		expect(scene.props.count).toBe(2);
		expect(container.commits).toHaveLength(2);

		mounted.update(MixedBoundaryApp, {
			root,
			theme: 'light',
			log: (entry: string) => log.push(entry),
			hostRef,
		});
		expect(container.children[0]).toBe(scene);
		expect(scene.props).toMatchObject({ theme: 'light', count: 2 });
		expect(container.commits).toHaveLength(3);

		mounted.unmount();
		expect(container.children).toEqual([]);
		expect(refs.at(-1)).toBe(null);
		expect(log).toContain('scene-cleanup:light:2');
	});

	it('clears an abandoned boundary bridge when prepared host abort throws', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...baseDriver,
			prepareBatch(target, batch, context) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				return {
					...prepared,
					abort() {
						prepared.abort();
						throw new Error('boundary prepared abort fault');
					},
				};
			},
		});
		const queued: Array<() => void> = [];
		const queue = vi
			.spyOn(globalThis, 'queueMicrotask')
			.mockImplementation((callback) => queued.push(callback));
		try {
			expect(() =>
				mount(AbandonedBoundaryApp, {
					root,
					log: () => {},
				}),
			).toThrow('DOM sibling failed after renderer boundary');

			let abortFault: unknown;
			for (const callback of [...queued]) {
				try {
					callback();
				} catch (error) {
					if ((error as Error).message === 'boundary prepared abort fault') abortFault = error;
					else throw error;
				}
			}
			expect(abortFault).toMatchObject({ message: 'boundary prepared abort fault' });
			expect(container.children).toEqual([]);
			expect(container.instanceCount).toBe(0);
		} finally {
			queue.mockRestore();
		}

		const remounted = mount(MixedBoundaryApp, {
			root,
			theme: 'remounted',
			log: () => {},
		});
		expect(container.children.map((child) => child.type)).toEqual(['scene', 'mesh']);
		remounted.unmount();
	});

	it('materializes the shared reverse Html region as an executable DOM component', () => {
		const { container, root } = objectRoot();
		root.render(ReverseScene, { label: 'overlay' });
		const boundary = container.children[0];
		expect(boundary.type).toBe('html-region');
		const region = boundary.props.region;
		expect(isRendererRegion(region)).toBe(true);
		const typed = region as RendererRegion<{ render: () => unknown }>;
		expect(typed).toMatchObject({ ownerRenderer: 'object', childRenderer: 'dom' });

		const dom = mount(typed.component as ComponentBody<{ render: () => unknown }>, typed.props);
		expect(dom.html()).toBe('<!----><section class="overlay">overlay</section><!---->');

		dom.unmount();
		root.unmount();
	});

	it('lowers nested Canvas and Html regions under each alternating renderer owner', () => {
		const outer = objectRoot();
		const nested = objectRoot();
		const mounted = mount(InlineAlternatingBoundaryApp, {
			root: outer.root,
			nestedRoot: nested.root,
			label: 'overlay',
		});

		expect(outer.container.children.map((child) => child.type)).toEqual(['html-region']);
		const region = outer.container.children[0].props.region;
		expect(isRendererRegion(region)).toBe(true);
		const typed = region as RendererRegion<{ render: () => unknown }>;
		const dom = mount(typed.component as ComponentBody<{ render: () => unknown }>, typed.props);

		expect(dom.find('.overlay').textContent).toBe('overlay');
		expect(nested.container.children).toHaveLength(1);
		expect(nested.container.children[0]).toMatchObject({
			type: 'nested-mesh',
			props: { depth: 'inner' },
		});

		dom.unmount();
		expect(nested.container.children).toEqual([]);
		mounted.unmount();
		expect(outer.container.children).toEqual([]);
	});

	it('rejects a renderer-region payload whose identity does not match its boundary', () => {
		const { root } = objectRoot();
		const badRegion = rendererRegion('dom', 'other', () => null, {});
		expect(() =>
			mount(Canvas as ComponentBody<any>, {
				root,
				children: badRegion,
			}),
		).toThrow('cannot mount region "dom" -> "other"');
		root.unmount();
	});
});

describe('reverse renderer owner bridge', () => {
	it('reads live universal context through a memoized DOM child', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		root.render(ReverseOwnerScene, { theme: 'dark', log: (entry) => log.push(entry) });
		const first = committedDomRegion(container);
		const body = first.component as ComponentBody<any>;
		const dom = mount(body, first.props);
		const label = dom.find('.reverse-theme');
		expect(label.textContent).toBe('dark');

		root.render(ReverseOwnerScene, {
			theme: 'light',
			log: (entry) => log.push(entry),
			version: 1,
		});
		const next = committedDomRegion(container);
		dom.update(body, next.props);
		expect(dom.find('.reverse-theme')).toBe(label);
		expect(label.textContent).toBe('light');

		dom.unmount();
		root.unmount();
	});

	it('remounts a reverse DOM owner when Provider topology changes', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const record = (entry: string) => log.push(entry);
		let captured: RendererRegion<any> | null = null;
		const props = (provided: boolean, theme: string): ReverseProviderTopologyProps => ({
			provided,
			theme,
			log: record,
			capture: (region) => {
				captured = region;
			},
		});

		root.render(ReverseProviderTopologyScene, props(true, 'dark'));
		const first = captured!;
		const body = first.component as ComponentBody<any>;
		const firstDom = mount(body, first.props);
		expect(firstDom.find('.reverse-theme').textContent).toBe('dark');
		expect(log).toEqual(['dom-layout']);

		root.render(ReverseProviderTopologyScene, props(false, 'ignored'));
		expect(firstDom.html()).toBe('');
		expect(log).toEqual(['dom-layout', 'dom-cleanup']);
		const second = captured!;
		expect(second).not.toBe(first);
		const secondDom = mount(body, second.props);
		const defaultLabel = secondDom.find('.reverse-theme');
		expect(defaultLabel.textContent).toBe('default');

		root.render(ReverseProviderTopologyScene, props(false, 'still-ignored'));
		const retained = captured!;
		secondDom.update(body, retained.props);
		expect(secondDom.find('.reverse-theme')).toBe(defaultLabel);
		expect(log).toEqual(['dom-layout', 'dom-cleanup', 'dom-layout']);

		root.render(ReverseProviderTopologyScene, props(true, 'light'));
		expect(secondDom.html()).toBe('');
		expect(log).toEqual(['dom-layout', 'dom-cleanup', 'dom-layout', 'dom-cleanup']);
		const third = captured!;
		const thirdDom = mount(body, third.props);
		expect(thirdDom.find('.reverse-theme').textContent).toBe('light');
		root.unmount();
		expect(thirdDom.html()).toBe('');
		expect(log.at(-1)).toBe('dom-cleanup');
	});

	it('rejects attachment from an uncommitted universal descriptor', () => {
		const { container, root } = objectRoot();
		let captured: RendererRegion<any> | null = null;
		const attempt = root.prepare(ReverseOwnerScene, {
			theme: 'dark',
			log: () => {},
			capture: (region) => {
				captured = region;
			},
		});
		expect(attempt.status).toBe('prepared');
		expect(captured).not.toBeNull();

		const element = document.createElement('div');
		document.body.appendChild(element);
		const domRoot = createRoot(element);
		expect(() =>
			domRoot.render(captured!.component as ComponentBody<any>, captured!.props),
		).toThrow(/cannot attach before its universal region commits/);
		domRoot.unmount();
		element.remove();
		attempt.abort();
		expect(container.children).toEqual([]);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		root.unmount();
	});

	it('routes an initial DOM child error to the nearest universal try owner', async () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		root.render(ReverseOwnerScene, {
			theme: 'dark',
			log: (entry) => log.push(entry),
			error: true,
		});
		const region = committedDomRegion(container);
		const dom = mount(region.component as ComponentBody<any>, region.props);
		await flushBridgeWork();

		expect(container.children[0]).toMatchObject({
			type: 'status',
			props: { value: 'caught:reverse dom failed' },
		});
		expect(log).toEqual([]);
		dom.unmount();
		root.unmount();
	});

	it('routes DOM child suspension to the nearest universal pending owner', async () => {
		const { container, root } = objectRoot();
		let resolve!: () => void;
		const thenable = new Promise<void>((done) => {
			resolve = done;
		});
		root.render(ReverseOwnerScene, {
			theme: 'dark',
			log: () => {},
			thenable,
		});
		const region = committedDomRegion(container);
		const dom = mount(region.component as ComponentBody<any>, region.props);
		await flushBridgeWork();
		expect(container.children).toHaveLength(2);
		expect(container.children[0]).toMatchObject({
			type: 'html-region',
			visible: false,
		});
		expect(container.children[1]).toMatchObject({
			type: 'status',
			props: { value: 'pending' },
		});

		resolve();
		await thenable;
		await flushBridgeWork();
		expect(container.children).toHaveLength(1);
		expect(container.children[0]).toMatchObject({
			type: 'html-region',
			visible: true,
		});
		dom.unmount();
		root.unmount();
	});

	it('retains transition updates owned by a renderer region while its try arm is pending', async () => {
		const { container, root } = objectRoot();
		const pending = deferred<void>();
		let update!: (value: number) => void;
		root.render(ReverseOwnerScene, {
			theme: 'dark',
			log: () => {},
			thenable: pending.promise,
			captureUpdate(value) {
				update = value;
			},
		});
		const first = committedDomRegion(container);
		const dom = mount(first.component as ComponentBody<any>, first.props);
		await flushBridgeWork();
		expect(container.children[0].visible).toBe(false);

		startTransition(() => update(1));
		await flushBridgeWork();
		expect((committedDomRegion(container).props as any).count).toBe(0);

		pending.resolve();
		await pending.promise;
		await flushBridgeWork();
		await flushBridgeWork();
		expect(container.children).toHaveLength(1);
		expect((committedDomRegion(container).props as any).count).toBe(1);

		dom.unmount();
		root.unmount();
	});

	it('settles blocked transitions when an unrelated retained replay throws', async () => {
		const controlled = controlledObjectRoot();
		const routed = deferred<void>();
		let rejectReplay!: (error: Error) => void;
		const replayFailure = new Promise<string>((_resolve, reject) => {
			rejectReplay = reject;
		});
		let updateCount!: (value: number) => void;
		let suspendReplay!: () => void;
		let captured!: RendererRegion<any>;
		const Scene = defineUniversalComponent('object', () => [
			universalTry(
				() => {
					const [count, setCount] = useState(0, 'blocked-count');
					updateCount = setCount;
					captured = rendererRegion('object', 'dom', ReverseOwnerDom, {
						log() {},
						thenable: routed.promise,
						count,
					});
					return universalValue(reverseRegionPlan, [captured]);
				},
				() => universalValue(reverseStatusPlan, ['routed-pending']),
			),
			universalTry(
				() => {
					const [resource, setResource] = useState<Promise<string>>(
						fulfilled('ready'),
						'replay-resource',
					);
					suspendReplay = () => setResource(replayFailure);
					return universalValue(reverseStatusPlan, [use(resource)]);
				},
				() => universalValue(reverseStatusPlan, ['local-pending']),
			),
		]);
		const flushControlled = () => {
			for (let count = 0; controlled.scheduled.length > 0; count++) {
				if (count === 25) throw new Error('Controlled boundary scheduler did not stabilize.');
				controlled.scheduled.shift()!();
			}
		};

		controlled.root.render(Scene, undefined);
		const dom = mount(captured.component as ComponentBody<any>, captured.props);
		await flushBridgeWork();
		flushControlled();
		expect(controlled.container.children[0]).toMatchObject({
			type: 'html-region',
			visible: false,
		});

		startTransition(() => updateCount(1));
		flushControlled();
		expect((committedDomRegion(controlled.container).props as any).count).toBe(0);

		const PendingProbe = defineUniversalComponent('object', () => {
			const [pending] = useTransition('transition');
			return universalValue(reverseStatusPlan, [pending]);
		});
		const probe = objectRoot();
		probe.root.render(PendingProbe, undefined);
		expect(probe.container.children[0].props.value).toBe(true);

		suspendReplay();
		flushControlled();
		rejectReplay(new Error('unrelated replay failed'));
		await replayFailure.catch(() => undefined);
		await Promise.resolve();
		expect(controlled.scheduled).not.toHaveLength(0);
		expect(() => controlled.scheduled.shift()!()).toThrow('unrelated replay failed');
		await flushBridgeWork();
		expect(probe.container.children[0].props.value).toBe(false);

		probe.root.unmount();
		dom.unmount();
		controlled.root.unmount();
	});

	it('automatically unmounts a committed DOM child root exactly once', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		root.render(ReverseOwnerScene, { theme: 'dark', log: (entry) => log.push(entry) });
		const region = committedDomRegion(container);
		const dom = mount(region.component as ComponentBody<any>, region.props);
		expect(log).toEqual(['dom-layout']);

		root.unmount();
		expect(dom.html()).toBe('');
		expect(log).toEqual(['dom-layout', 'dom-cleanup']);
		dom.unmount();
		expect(log).toEqual(['dom-layout', 'dom-cleanup']);
	});

	it('routes DOM effect cleanup and ref attachment faults through the universal owner', async () => {
		for (const fault of ['cleanup', 'ref'] as const) {
			const { container, root } = objectRoot();
			const log: string[] = [];
			const hostRef =
				fault === 'ref'
					? (value: unknown) => {
							if (value !== null) throw new Error('reverse dom ref failed');
						}
					: undefined;
			root.render(ReverseOwnerScene, {
				theme: 'dark',
				log: (entry) => log.push(entry),
				throwCleanup: fault === 'cleanup',
				hostRef,
			});
			const first = committedDomRegion(container);
			const body = first.component as ComponentBody<any>;
			const dom = mount(body, first.props);

			if (fault === 'cleanup') {
				root.render(ReverseOwnerScene, {
					theme: 'dark',
					log: (entry) => log.push(entry),
					version: 1,
					throwCleanup: false,
				});
				dom.update(body, committedDomRegion(container).props);
			}
			await flushBridgeWork();
			expect(container.children[0]).toMatchObject({
				type: 'status',
				props: {
					value:
						fault === 'cleanup'
							? 'caught:reverse dom cleanup failed'
							: 'caught:reverse dom ref failed',
				},
			});
			dom.unmount();
			root.unmount();
		}
	});
});
