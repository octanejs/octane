import { describe, expect, it, vi } from 'vitest';
import { compile } from '../src/compiler/compile.js';
import {
	createObjectContainer,
	createObjectDriver,
	createPortal,
	createUniversalRoot,
	defineUniversalComponent,
	universalKey,
	universalList,
	universalPlan,
	universalValue,
	use,
	useContext as useUniversalContext,
	useEffect as useUniversalEffect,
	useInsertionEffect as useUniversalInsertionEffect,
	useLayoutEffect as useUniversalLayoutEffect,
	useState as useUniversalState,
} from '../src/universal.js';
import { mount } from './_helpers.js';
import { UniversalBoundaryFixture, UniversalTheme } from './_fixtures/universal-boundary.tsrx';
import { CompiledUniversalScene } from './_fixtures/compiled-universal.object.tsrx';

const renderer = { id: 'object', module: 'octane/universal', target: 'universal' } as const;

const itemPlan = universalPlan('object', {
	kind: 'range',
	children: [
		{ kind: 'host', type: 'node', bindings: [['value', 0]] },
		{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] },
	],
});

const scenePlan = universalPlan('object', {
	kind: 'host',
	type: 'scene',
	children: [{ kind: 'slot', slot: 0 }],
});

interface Item {
	id: string;
	value: number;
	label: string;
}

const Scene = defineUniversalComponent('object', (props: { items: Item[] }) =>
	universalValue(scenePlan, [
		universalList(props.items, (item) =>
			universalKey(item.id, universalValue(itemPlan, [item.value, item.label])),
		),
	]),
);

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

describe('universal compiler target', () => {
	it('leaves the DOM compiler byte-identical when renderer selection stays DOM', () => {
		const source =
			'export function Card({title}) @{ <article><h1>{title as string}</h1></article> }';
		const legacy = compile(source, '/src/Card.tsrx', { hmr: false });
		const explicitDom = compile(source, '/src/Card.tsrx', {
			hmr: false,
			renderer: { id: 'dom', module: 'octane', target: 'dom' },
		});

		expect(explicitDom).toEqual(legacy);
	});

	it('emits a static host plan with dynamic values and keyed range lowering', () => {
		const source = `
			export function Scene({items, color}) @{
				<scene tone={color}>
					@for (const item of items; key item.id) {
						<><node value={item.value}/><label>{item.label as string}</label></>
					}
				</scene>
			}
		`;
		const output = compile(source, '/src/Scene.object.tsrx', { renderer }).code;

		expect(output).toContain('from "octane/universal"');
		expect(output).toContain('"kind": "host"');
		expect(output).toContain('"kind": "range"');
		expect(output).toContain('"bindings": [["tone", 0]]');
		expect(output).not.toContain('<scene');
	});

	it('fails closed when unsupported JSX or runtime hooks remain after plan lowering', () => {
		expect(() =>
			compile(
				'export function Scene({ok}) @{ <scene>{ok ? <node /> : null}</scene> }',
				'/src/Scene.object.tsrx',
				{ renderer },
			),
		).toThrow(/cannot fall back to DOM codegen/);
		expect(() =>
			compile(
				`export function Scene() @{ <scene /> }
				 const Nested = () => <node />;`,
				'/src/Nested.object.tsrx',
				{ renderer },
			),
		).toThrow(/cannot fall back to DOM codegen/);
		expect(() =>
			compile(
				`import { useId } from 'octane';
				 export function Scene() @{ const id = useId(); <scene id={id} /> }`,
				'/src/UnsupportedHook.object.tsrx',
				{ renderer },
			),
		).toThrow(/runtime import "useId" is not supported/);
	});

	it('capability-gates universal server serialization', () => {
		expect(() =>
			compile('export function Scene() @{ <scene/> }', '/src/Scene.object.tsrx', {
				mode: 'server',
				renderer,
			}),
		).toThrow(/serialization\/hydration capability/);
		expect(() =>
			compile(
				'export function Scene() @{ <Activity mode="hidden"><node /></Activity> }',
				'/src/Scene.object.tsrx',
				{ renderer },
			),
		).toThrow(/Activity requires an explicit renderer visibility capability/);
	});

	it('executes a compiler-produced static plan through the object driver', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const refValues: unknown[] = [];
		const hostRef = (value: unknown) => refValues.push(value);

		root.render(CompiledUniversalScene, {
			tone: 'warm',
			value: 1,
			label: 'first',
			log: (entry: string) => log.push(entry),
			hostRef,
		});
		expect(container.children[0]).toMatchObject({
			type: 'scene',
			props: { tone: 'warm' },
		});
		expect(container.children[0].children.map((child) => child.type)).toEqual(['node', 'label']);
		expect(container.children[0].children[1].children[0].props.value).toBe('first');
		expect(refValues).toEqual([container.children[0]]);
		expect(log).toEqual(['layout:first']);

		root.render(CompiledUniversalScene, {
			tone: 'cool',
			value: 2,
			label: 'second',
			log: (entry: string) => log.push(entry),
			hostRef,
		});
		expect(container.children[0].props.tone).toBe('cool');
		expect(container.children[0].children[0].props.value).toBe(2);
		expect(log).toEqual(['layout:first', 'cleanup:first', 'layout:second']);
		expect(container.commits).toHaveLength(2);

		const scene = container.children[0];
		root.unmount();
		expect(log).toEqual(['layout:first', 'cleanup:first', 'layout:second', 'cleanup:second']);
		expect(refValues.at(-1)).toBe(null);
		expect(scene.children).toEqual([]);
	});
});

describe('universal logical topology and transactions', () => {
	it('creates, updates, moves, inserts, and removes keyed ranges while preserving survivors', () => {
		const { container, root } = objectRoot();
		root.render(Scene, {
			items: [
				{ id: 'a', value: 1, label: 'A' },
				{ id: 'b', value: 2, label: 'B' },
			],
		});
		const scene = container.children[0];
		const aNode = scene.children[0];
		const aLabel = scene.children[1];
		const bNode = scene.children[2];
		expect(scene.children.map((child) => child.type)).toEqual(['node', 'label', 'node', 'label']);
		expect(container.commits).toHaveLength(1);

		root.render(Scene, {
			items: [
				{ id: 'b', value: 20, label: 'Bee' },
				{ id: 'a', value: 10, label: 'Aye' },
				{ id: 'c', value: 3, label: 'C' },
			],
		});
		expect(scene.children[0]).toBe(bNode);
		expect(scene.children[2]).toBe(aNode);
		expect(scene.children[3]).toBe(aLabel);
		expect(scene.children[0].props.value).toBe(20);
		expect(scene.children[1].children[0].props.value).toBe('Bee');
		expect(container.commits[1].commands.some((command) => command.op === 'move')).toBe(true);
		expect(container.commits[1].commands.some((command) => command.op === 'insert')).toBe(true);

		root.render(Scene, { items: [{ id: 'c', value: 30, label: 'See' }] });
		expect(scene.children).toHaveLength(2);
		expect(scene.children[0].props.value).toBe(30);
		expect(container.commits[2].commands.some((command) => command.op === 'remove')).toBe(true);
		expect(container.commits[2].commands.some((command) => command.op === 'destroy')).toBe(true);
		expect(container.commits).toHaveLength(3);
	});

	it('publishes callback and object refs after the host batch and clears them on teardown', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [
				['value', 0],
				['ref', 1],
			],
			children: [{ kind: 'host', type: 'leaf', bindings: [['ref', 2]] }],
		});
		const events: unknown[] = [];
		const ref = vi.fn((value: unknown) => events.push(value));
		const objectRef: { current: unknown } = { current: null };
		const Component = defineUniversalComponent('object', (props: { value: number }) =>
			universalValue(plan, [props.value, ref, objectRef]),
		);

		root.render(Component, { value: 1 });
		expect(ref).toHaveBeenCalledTimes(1);
		expect(events[0]).toBe(container.children[0]);
		expect(objectRef.current).toBe(container.children[0].children[0]);
		root.render(Component, { value: 2 });
		expect(ref).toHaveBeenCalledTimes(1);
		root.unmount();
		expect(events.at(-1)).toBe(null);
		expect(objectRef.current).toBe(null);
		expect(container.children).toEqual([]);
	});

	it('orders insertion, ref, layout, and passive work around one host batch', async () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const log: string[] = [];
		const driver = {
			...baseDriver,
			commit(target: typeof container, batch: (typeof container.commits)[number]) {
				log.push('host');
				baseDriver.commit(target, batch);
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['ref', 0]],
		});
		const Component = defineUniversalComponent('object', () => {
			useUniversalInsertionEffect(() => {
				log.push('insertion');
				return () => log.push('insertion-cleanup');
			}, []);
			useUniversalLayoutEffect(() => {
				log.push('layout');
				return () => log.push('layout-cleanup');
			}, []);
			useUniversalEffect(() => {
				log.push('passive');
				return () => log.push('passive-cleanup');
			}, []);
			return universalValue(plan, [
				(value: unknown) => log.push(value === null ? 'ref:null' : 'ref:instance'),
			]);
		});

		root.render(Component, undefined);
		expect(log).toEqual(['host', 'insertion', 'ref:instance', 'layout']);
		expect(container.commits).toHaveLength(1);
		await Promise.resolve();
		expect(log).toEqual(['host', 'insertion', 'ref:instance', 'layout', 'passive']);
		root.unmount();
		expect(log.slice(-4)).toEqual(['host', 'insertion-cleanup', 'layout-cleanup', 'ref:null']);
		await Promise.resolve();
		expect(log.at(-1)).toBe('passive-cleanup');
		expect(container.commits).toHaveLength(2);
	});

	it('defers passive updates and flushes each prior commit before the next render', async () => {
		const { root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Component = defineUniversalComponent('object', (props: { value: number }) => {
			useUniversalInsertionEffect(() => {
				log.push(`insertion:${props.value}`);
				return () => log.push(`insertion-cleanup:${props.value}`);
			}, [props.value]);
			useUniversalLayoutEffect(() => {
				log.push(`layout:${props.value}`);
				return () => log.push(`layout-cleanup:${props.value}`);
			}, [props.value]);
			useUniversalEffect(() => {
				log.push(`passive:${props.value}`);
				return () => log.push(`passive-cleanup:${props.value}`);
			}, [props.value]);
			return universalValue(plan);
		});

		root.render(Component, { value: 1 });
		await Promise.resolve();
		log.length = 0;
		root.render(Component, { value: 2 });
		expect([...log]).toEqual([
			'insertion-cleanup:1',
			'insertion:2',
			'layout-cleanup:1',
			'layout:2',
		]);

		root.render(Component, { value: 3 });
		expect([...log]).toEqual([
			'insertion-cleanup:1',
			'insertion:2',
			'layout-cleanup:1',
			'layout:2',
			'passive-cleanup:1',
			'passive:2',
			'insertion-cleanup:2',
			'insertion:3',
			'layout-cleanup:2',
			'layout:3',
		]);
		await Promise.resolve();
		expect(log.slice(-2)).toEqual(['passive-cleanup:2', 'passive:3']);
		root.unmount();
		await Promise.resolve();
	});

	it('preserves declaration order when removed and changed effect cleanups mix', async () => {
		const { root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const effect = (phase: string, name: string, value: number) => () => {
			log.push(`${phase}:create:${name}:${value}`);
			return () => log.push(`${phase}:cleanup:${name}:${value}`);
		};
		const Component = defineUniversalComponent(
			'object',
			(props: { showB: boolean; value: number }) => {
				useUniversalInsertionEffect(effect('insertion', 'A', props.value), [props.value], 'i:a');
				if (props.showB) {
					useUniversalInsertionEffect(effect('insertion', 'B', props.value), [props.value], 'i:b');
				}
				useUniversalInsertionEffect(effect('insertion', 'C', props.value), [props.value], 'i:c');

				useUniversalLayoutEffect(effect('layout', 'A', props.value), [props.value], 'l:a');
				if (props.showB) {
					useUniversalLayoutEffect(effect('layout', 'B', props.value), [props.value], 'l:b');
				}
				useUniversalLayoutEffect(effect('layout', 'C', props.value), [props.value], 'l:c');

				useUniversalEffect(effect('passive', 'A', props.value), [props.value], 'p:a');
				if (props.showB) {
					useUniversalEffect(effect('passive', 'B', props.value), [props.value], 'p:b');
				}
				useUniversalEffect(effect('passive', 'C', props.value), [props.value], 'p:c');
				return universalValue(plan);
			},
		);

		root.render(Component, { showB: true, value: 1 });
		await Promise.resolve();
		log.length = 0;
		root.render(Component, { showB: false, value: 2 });
		expect([...log]).toEqual([
			'insertion:cleanup:A:1',
			'insertion:cleanup:B:1',
			'insertion:cleanup:C:1',
			'insertion:create:A:2',
			'insertion:create:C:2',
			'layout:cleanup:A:1',
			'layout:cleanup:B:1',
			'layout:cleanup:C:1',
			'layout:create:A:2',
			'layout:create:C:2',
		]);
		await Promise.resolve();
		expect(log.slice(-5)).toEqual([
			'passive:cleanup:A:1',
			'passive:cleanup:B:1',
			'passive:cleanup:C:1',
			'passive:create:A:2',
			'passive:create:C:2',
		]);
		root.unmount();
		await Promise.resolve();
	});

	it('routes a successful commit through one optional transport batch', () => {
		const container = createObjectContainer();
		const driver = createObjectDriver();
		const transported: unknown[] = [];
		const root = createUniversalRoot(container, driver, {
			transport: {
				commit(target, batch, apply) {
					transported.push(batch);
					apply(batch);
					expect(target).toBe(container);
				},
			},
		});
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Component = defineUniversalComponent('object', () => universalValue(plan));

		root.render(Component, undefined);
		expect(transported).toEqual([container.commits[0]]);
		expect(container.commits).toHaveLength(1);
		root.unmount();
	});

	it('schedules captured state updates back through their owning root', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		let update!: (value: number | ((previous: number) => number)) => void;
		const Component = defineUniversalComponent('object', () => {
			const [value, setValue] = useUniversalState(1);
			update = setValue;
			return universalValue(plan, [value]);
		});

		root.render(Component, undefined);
		update((value) => value + 1);
		await Promise.resolve();
		await Promise.resolve();
		expect(container.children[0].props.value).toBe(2);
		expect(container.commits).toHaveLength(2);
		root.unmount();
	});

	it('does not publish cleanups or topology when host acceptance rejects', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let reject = false;
		const driver = {
			...baseDriver,
			commit(target: typeof container, batch: (typeof container.commits)[number]) {
				if (reject) throw new Error('host rejected');
				baseDriver.commit(target, batch);
			},
		};
		const root = createUniversalRoot(container, driver);
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const Component = defineUniversalComponent('object', (props: { value: number }) => {
			useUniversalLayoutEffect(() => {
				log.push(`layout:${props.value}`);
				return () => log.push(`cleanup:${props.value}`);
			}, [props.value]);
			return universalValue(plan, [props.value]);
		});

		root.render(Component, { value: 1 });
		reject = true;
		expect(() => root.render(Component, { value: 2 })).toThrow('host rejected');
		expect(container.children[0].props.value).toBe(1);
		expect(log).toEqual(['layout:1']);

		reject = false;
		root.render(Component, { value: 3 });
		expect(container.children[0].props.value).toBe(3);
		expect(log).toEqual(['layout:1', 'cleanup:1', 'layout:3']);
		root.unmount();
	});

	it('finalizes a host-accepted transaction when a layout callback throws', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const Component = defineUniversalComponent(
			'object',
			(props: { value: number; fail: boolean }) => {
				useUniversalLayoutEffect(() => {
					if (props.fail) throw new Error('layout failed');
				}, [props.fail]);
				return universalValue(plan, [props.value]);
			},
		);

		expect(() => root.render(Component, { value: 1, fail: true })).toThrow('layout failed');
		expect(container.children[0].props.value).toBe(1);
		root.render(Component, { value: 2, fail: false });
		expect(container.children[0].props.value).toBe(2);
		expect(container.commits).toHaveLength(2);
		root.unmount();
	});

	it('finishes ref and layout work when an insertion callback throws', () => {
		const { container, root } = objectRoot();
		const ref = vi.fn();
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['ref', 0]],
		});
		const Component = defineUniversalComponent('object', (props: { fail: boolean }) => {
			useUniversalInsertionEffect(() => {
				if (props.fail) throw undefined;
			}, [props.fail]);
			useUniversalLayoutEffect(() => {
				log.push(`layout:${props.fail}`);
			}, [props.fail]);
			return universalValue(plan, [ref]);
		});

		const noError = Symbol('no error');
		let caught: unknown = noError;
		try {
			root.render(Component, { fail: true });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeUndefined();
		expect(container.children).toHaveLength(1);
		expect(ref).toHaveBeenCalledWith(container.children[0]);
		expect(log).toEqual(['layout:true']);

		root.render(Component, { fail: false });
		expect(container.commits).toHaveLength(2);
		expect(ref).toHaveBeenCalledTimes(1);
		root.unmount();
	});

	it('finishes ref replacement and layout creation when a layout cleanup throws', () => {
		const { container, root } = objectRoot();
		const firstRef = vi.fn();
		const secondRef = vi.fn();
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['ref', 0]],
		});
		const Component = defineUniversalComponent(
			'object',
			(props: { value: number; hostRef: (value: unknown) => void }) => {
				useUniversalLayoutEffect(() => {
					log.push(`layout:${props.value}`);
					return () => {
						if (props.value === 1) throw new Error('layout cleanup failed');
					};
				}, [props.value]);
				return universalValue(plan, [props.hostRef]);
			},
		);

		root.render(Component, { value: 1, hostRef: firstRef });
		expect(() => root.render(Component, { value: 2, hostRef: secondRef })).toThrow(
			'layout cleanup failed',
		);
		expect(firstRef).toHaveBeenLastCalledWith(null);
		expect(secondRef).toHaveBeenCalledWith(container.children[0]);
		expect(log).toEqual(['layout:1', 'layout:2']);
		root.unmount();
	});

	it('invalidates stale passive work and makes transaction commits idempotent', async () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Component = defineUniversalComponent('object', (props: { enabled: boolean }) => {
			if (props.enabled) {
				useUniversalEffect(() => {
					log.push('mount');
					return () => log.push('cleanup');
				}, []);
			}
			return universalValue(plan);
		});

		const transaction = root.prepare(Component, { enabled: true });
		expect(transaction.status).toBe('prepared');
		if (transaction.status === 'prepared') {
			transaction.commit();
			transaction.commit();
		}
		await Promise.resolve();
		expect(log).toEqual(['mount']);
		expect(container.commits).toHaveLength(1);

		root.render(Component, { enabled: false });
		expect(log).toEqual(['mount']);
		root.render(Component, { enabled: true });
		expect(log).toEqual(['mount', 'cleanup']);
		root.unmount();
		await Promise.resolve();
		expect(log).toEqual(['mount', 'cleanup']);
	});

	it('drops errored, suspended, and superseded attempts without a host commit', async () => {
		const { container, root } = objectRoot();
		const singlePlan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		const Value = defineUniversalComponent('object', (props: { value: string }) =>
			universalValue(singlePlan, [props.value]),
		);
		const Throw = defineUniversalComponent('object', () => {
			throw new Error('render failed');
		});

		const first = root.prepare(Value, { value: 'A' });
		expect(first.status).toBe('prepared');
		if (first.status === 'prepared') first.abort();
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);

		const superseded = root.prepare(Value, { value: 'B' });
		const winner = root.prepare(Value, { value: 'C' });
		expect(superseded.status).toBe('aborted');
		expect(container.commits).toHaveLength(0);
		if (winner.status === 'prepared') winner.commit();
		expect(container.children[0].props.value).toBe('C');
		expect(container.commits).toHaveLength(1);

		expect(() => root.render(Throw, undefined)).toThrow('render failed');
		expect(container.commits).toHaveLength(1);

		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		const Suspends = defineUniversalComponent('object', () =>
			universalValue(singlePlan, [use(pending)]),
		);
		const suspended = root.render(Suspends, undefined);
		expect(suspended.status).toBe('suspended');
		expect(container.commits).toHaveLength(1);
		resolve('ready');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		expect(container.children[0].props.value).toBe('ready');
		expect(container.commits).toHaveLength(2);
		expect(container.instanceCount).toBe(1);
	});

	it('fails renderer mismatches clearly and capability-gates portals', () => {
		const { root } = objectRoot();
		const plan = universalPlan('other', { kind: 'host', type: 'node' });
		const Wrong = defineUniversalComponent('other', () => universalValue(plan));
		const WrongPlan = defineUniversalComponent('object', () => universalValue(plan));

		expect(() => root.render(Wrong, undefined)).toThrow(
			/root "object" cannot render component "other"/,
		);
		expect(() => root.render(WrongPlan, undefined)).toThrow(
			/root expects "object" but the plan targets "other"/,
		);
		const mismatchedContainer = createObjectContainer('other');
		const mismatchedRoot = createUniversalRoot(mismatchedContainer, createObjectDriver('object'));
		const objectPlan = universalPlan('object', { kind: 'host', type: 'node' });
		const ObjectComponent = defineUniversalComponent('object', () => universalValue(objectPlan));
		expect(() => mismatchedRoot.render(ObjectComponent, undefined)).toThrow(
			/driver "object", container "other", batch "object"/,
		);
		mismatchedRoot.unmount();
		expect(() => createPortal()).toThrow(/portal capability/);
	});

	it('requires drivers to opt into text instead of assuming a fake-DOM text API', () => {
		const container = createObjectContainer();
		const driver = { ...createObjectDriver(), capabilities: new Set<string>() };
		const root = createUniversalRoot(container, driver);
		const textPlan = universalPlan('object', { kind: 'text', value: 'hello' });
		const Text = defineUniversalComponent('object', () => universalValue(textPlan));

		expect(() => root.render(Text, undefined)).toThrow(/does not declare the text capability/);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
	});
});

describe('mixed DOM and universal ownership', () => {
	it('preserves context, ref/layout ordering, and parent-first teardown', () => {
		const { container, root } = objectRoot();
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [
				['theme', 0],
				['ref', 1],
			],
		});
		const Child = defineUniversalComponent('object', (props: { log: (entry: string) => void }) => {
			const theme = useUniversalContext(UniversalTheme);
			useUniversalLayoutEffect(() => {
				props.log(`object-layout:${theme}`);
				return () => props.log('object-cleanup');
			}, [props.log, theme]);
			const ref = (value: unknown) =>
				props.log(value === null ? 'object-ref:null' : `object-ref:${(value as any).type}`);
			return universalValue(plan, [theme, ref]);
		});

		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: Child,
			childProps: { log: (entry: string) => log.push(entry) },
			theme: 'dark',
			log: (entry: string) => log.push(entry),
			failAfterPrepare: false,
		});
		expect(container.children[0].props.theme).toBe('dark');
		expect(log).toEqual(['object-ref:node', 'object-layout:dark', 'dom-layout']);
		expect(container.commits).toHaveLength(1);

		log.length = 0;
		mounted.unmount();
		expect(log).toEqual(['dom-cleanup', 'object-cleanup', 'object-ref:null']);
		expect(container.children).toEqual([]);
	});

	it('routes render errors lexically and aborts a prepared sibling transaction', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Child = defineUniversalComponent('object', () => universalValue(plan));
		const prepare = root.prepare.bind(root);
		let captured: ReturnType<typeof root.prepare> | null = null;
		root.prepare = ((...args: Parameters<typeof root.prepare>) => {
			captured = prepare(...args);
			return captured;
		}) as typeof root.prepare;
		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: Child,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: true,
		});

		expect(mounted.find('.caught').textContent).toBe('caught: later sibling failed');
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		await Promise.resolve();
		expect(captured?.status).toBe('aborted');
		mounted.unmount();
		root.unmount();
	});

	it('releases initial boundary ownership when the universal child throws during prepare', () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', { kind: 'host', type: 'node' });
		const Throw = defineUniversalComponent('object', () => {
			throw new Error('object render failed');
		});
		const failed = mount(UniversalBoundaryFixture, {
			root,
			component: Throw,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: false,
		});
		expect(failed.find('.caught').textContent).toBe('caught: object render failed');
		expect(container.commits).toHaveLength(0);
		failed.unmount();

		const Safe = defineUniversalComponent('object', () => universalValue(plan));
		const recovered = mount(UniversalBoundaryFixture, {
			root,
			component: Safe,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: false,
		});
		expect(container.commits).toHaveLength(1);
		recovered.unmount();
	});

	it('aborts a suspended initial boundary when its DOM owner is abandoned', async () => {
		const { container, root } = objectRoot();
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			bindings: [['value', 0]],
		});
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		const Suspends = defineUniversalComponent('object', () => universalValue(plan, [use(pending)]));
		const prepare = root.prepare.bind(root);
		let captured: ReturnType<typeof root.prepare> | null = null;
		root.prepare = ((...args: Parameters<typeof root.prepare>) => {
			captured = prepare(...args);
			return captured;
		}) as typeof root.prepare;

		const mounted = mount(UniversalBoundaryFixture, {
			root,
			component: Suspends,
			childProps: {},
			theme: 'dark',
			log: () => {},
			failAfterPrepare: true,
		});
		await Promise.resolve();
		expect(captured?.status).toBe('aborted');
		resolve('late');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		mounted.unmount();
		root.unmount();
	});
});
