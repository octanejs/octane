import { describe, expect, it } from 'vitest';
import {
	type ObjectHostContainer,
	type ObjectHostInstance,
	type UniversalAsyncCommitTransport,
	type UniversalHostCommand,
	createContext,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	hmrUniversalComponent,
	markUniversalHostComponent,
	universalComponent,
	universalContext,
	universalFor,
	universalHostComponentLeafPlan,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	useLayoutEffect,
	useState,
} from '../src/universal.js';

const hostPlan = universalPlan('object', {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
	children: [{ kind: 'host', type: 'child' }],
});

function createTemplateObjectDriver(
	collapsed = false,
	program = false,
	lazyPublicInstances = false,
	runs = false,
) {
	const base = createObjectDriver();
	return {
		...base,
		capabilities: {
			...base.capabilities,
			templateMount: true,
			collapsedTemplateMount: collapsed,
			templateProgramMount: program,
			stableStaticHostProps: program,
			lazyPublicInstances,
			templateProgramRuns: runs,
		},
		prepareBatch(...args: Parameters<typeof base.prepareBatch>) {
			const [container, batch, context] = args;
			const expanded: UniversalHostCommand[] = [];
			for (const command of batch.commands) {
				if (command.op === 'destroy-run') {
					for (let row = 0; row < command.count; row++) {
						const rootId = command.firstId + row * command.width;
						expanded.push({ op: 'remove', parent: command.parent, id: rootId });
						for (let node = command.width - 1; node >= 0; node--) {
							expanded.push({ op: 'destroy', id: rootId + node });
						}
					}
					continue;
				}
				if (command.op !== 'mount-template-run') {
					expanded.push(command);
					continue;
				}
				const valuesPerRow = command.values.length / command.count;
				for (let index = 0; index < command.count; index++) {
					expanded.push({
						op: 'mount-template-range',
						parent: command.parent,
						before: command.before,
						program: command.program,
						firstId: command.firstId + index * command.program.nodes.length,
						firstListenerId:
							command.firstListenerId === null
								? null
								: command.firstListenerId + index * command.program.events.length,
						values: command.values.slice(index * valuesPerRow, (index + 1) * valuesPerRow),
					});
				}
			}
			const commands: UniversalHostCommand[] = [];
			for (const command of expanded) {
				if (command.op === 'ensure-public-instance') continue;
				if (command.op !== 'mount-template' && command.op !== 'mount-template-range') {
					commands.push(command);
					continue;
				}
				const shape = command.op === 'mount-template' ? command.shape : command.program.nodes;
				const nodes =
					command.op === 'mount-template'
						? command.nodes
						: command.program.nodes.map((entry, index) => {
								const props = { ...entry.props };
								for (const binding of entry.bindings ?? []) {
									props[binding.name] = command.values[binding.valueIndex];
								}
								const events = command.program.events.flatMap((event, eventIndex) =>
									event.node === index
										? [
												{
													type: event.type,
													listener: {
														id: command.firstListenerId! + eventIndex,
														priority: event.priority,
													},
												},
											]
										: [],
								);
								return { id: command.firstId + index, props, events };
							});
				for (let index = 0; index < nodes.length; index++) {
					const node = nodes[index];
					commands.push({
						op: 'create',
						id: node.id,
						type: shape[index].type,
						props: node.props,
					});
				}
				for (const node of nodes) {
					for (const event of node.events ?? []) {
						commands.push({
							op: 'event',
							id: node.id,
							type: event.type,
							listener: event.listener,
						});
					}
				}
				const children: number[][] = nodes.map(() => []);
				for (let index = 1; index < shape.length; index++) {
					children[shape[index].parent].push(index);
				}
				const place = (index: number, parent: number | null, before: number | null): void => {
					for (const child of children[index]) place(child, nodes[index].id, null);
					commands.push({ op: 'insert', parent, id: nodes[index].id, before });
				};
				if (typeof command.parent === 'object' && command.parent !== null) {
					throw new Error('Object template test driver does not support portal parents.');
				}
				place(0, command.parent, command.before);
			}
			return base.prepareBatch(container, { ...batch, commands }, context);
		},
	};
}

describe('universal prepared host SDK', () => {
	it('rejects invalid prepared tokens without publishing or losing accepted hosts', () => {
		const container = createObjectContainer();
		const objectDriver = createObjectDriver();
		const valid = Symbol('valid prepared token');
		let nextToken: unknown = valid;
		const driver = {
			...objectDriver,
			prepareBatch(
				host: Parameters<typeof objectDriver.prepareBatch>[0],
				batch: Parameters<typeof objectDriver.prepareBatch>[1],
				context: Parameters<typeof objectDriver.prepareBatch>[2],
			) {
				return nextToken === valid
					? objectDriver.prepareBatch(host, batch, context)
					: (nextToken as ReturnType<typeof objectDriver.prepareBatch>);
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'validated',
			bindings: [['value', 0]],
		});
		const Scene = defineUniversalComponent('object', ({ value }: { value: string }) =>
			universalValue(plan, [value]),
		);

		root.render(Scene, { value: 'accepted' });
		const accepted = container.children[0];
		for (const invalid of [
			null,
			{},
			{ apply() {}, abort: 1 },
			{ apply() {}, abort() {}, afterAccept: 1 },
		]) {
			nextToken = invalid;
			expect(() => root.render(Scene, { value: 'rejected' })).toThrow(/valid prepared batch token/);
			expect(container.children).toEqual([accepted]);
			expect(accepted.props.value).toBe('accepted');
		}

		nextToken = valid;
		root.render(Scene, { value: 'recovered' });
		expect(container.children).toEqual([accepted]);
		expect(accepted.props.value).toBe('recovered');
		root.unmount();
	});

	it('keeps an async root usable after rejecting an invalid unmount token', async () => {
		const container = createObjectContainer();
		const objectDriver = createObjectDriver();
		const driver = {
			...objectDriver,
			capabilities: { ...objectDriver.capabilities, localHostCallbacks: false },
		};
		let invalid = false;
		const transport: UniversalAsyncCommitTransport<ObjectHostContainer> = {
			mode: 'async',
			prepareBatch(host, batch, identity) {
				if (invalid) {
					return {
						async apply() {},
						abort() {},
						afterAccept: 1,
					} as unknown as ReturnType<
						UniversalAsyncCommitTransport<ObjectHostContainer>['prepareBatch']
					>;
				}
				const prepared = driver.prepareBatch(host, batch, {
					invokeLocalCallback() {
						throw new Error('No local callbacks are registered.');
					},
				});
				return {
					async apply(acknowledge) {
						prepared.apply();
						acknowledge({ ...identity, type: 'ack' });
					},
					afterAccept: prepared.afterAccept,
					abort: prepared.abort,
				};
			},
		};
		const root = createUniversalRoot(container, driver, { transport });
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'async-validated',
			bindings: [['value', 0]],
		});
		const Scene = defineUniversalComponent('object', ({ value }: { value: string }) =>
			universalValue(plan, [value]),
		);

		await root.renderAsync(Scene, { value: 'accepted' });
		const accepted = container.children[0];
		invalid = true;
		await expect(root.unmountAsync()).rejects.toThrow(/valid prepared batch token/);
		expect(container.children).toEqual([accepted]);
		expect(accepted.props.value).toBe('accepted');

		invalid = false;
		await root.renderAsync(Scene, { value: 'recovered' });
		expect(container.children).toEqual([accepted]);
		expect(accepted.props.value).toBe('recovered');
		await root.unmountAsync();
		expect(container.children).toEqual([]);
	});

	it('rejects host adapters whose renderer, forwarding plan, or hot-reload contract differs', () => {
		const plan = universalPlan('object', { kind: 'host', type: 'wrapped', propsSlot: 0 });
		const component = defineUniversalComponent<Record<string, unknown>>('object', (props) =>
			universalValue(plan, [universalProps([['spread', props]])]),
		);
		const incorrectRenderer = universalPlan('other', {
			kind: 'host',
			type: 'wrapped',
			propsSlot: 0,
		});
		const staticChildren = universalPlan('object', {
			kind: 'host',
			type: 'wrapped',
			propsSlot: 0,
			children: [{ kind: 'host', type: 'child' }],
		});

		expect(() => markUniversalHostComponent(component, 'other', incorrectRenderer)).toThrow(
			/renderer/,
		);
		expect(() => markUniversalHostComponent(component, 'object', incorrectRenderer)).toThrow(
			/matching forwarded-props host/,
		);
		expect(() => markUniversalHostComponent(component, 'object', staticChildren)).toThrow(
			/matching forwarded-props host/,
		);
		expect(() =>
			markUniversalHostComponent(hmrUniversalComponent('object', component), 'object', plan),
		).toThrow(/hot-reloadable/);
		expect(markUniversalHostComponent(component, 'object', plan)).toBe(component);
		expect(markUniversalHostComponent(component, 'object', plan)).toBe(component);
		expect(universalHostComponentLeafPlan('object', component, '["value"]')).toBe(
			universalHostComponentLeafPlan('object', component, '["value"]'),
		);
		expect(universalHostComponentLeafPlan('other', component, '["value"]')).toBeUndefined();
		expect(() => universalHostComponentLeafPlan('object', component, '["__proto__"]')).toThrow(
			/safe, unique ordinary prop names/,
		);
		expect(() => universalHostComponentLeafPlan('object', component, '["value","value"]')).toThrow(
			/safe, unique ordinary prop names/,
		);
	});

	it('preserves keyed host-wrapper identity, children, refs, callbacks, and events', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const wrapperPlan = universalPlan('object', {
			kind: 'host',
			type: 'wrapped',
			propsSlot: 0,
		});
		const detailPlan = universalPlan('object', {
			kind: 'host',
			type: 'detail',
			bindings: [['label', 0]],
		});
		const callable = defineUniversalComponent<Record<string, unknown>>('object', (props) =>
			universalValue(wrapperPlan, [universalProps([['spread', props]])]),
		);
		const Wrapped = markUniversalHostComponent(callable, 'object', wrapperPlan);
		const events: string[] = [];
		const updates: string[] = [];
		const attachments: string[] = [];
		const refValues = new Map<string, ObjectHostInstance | null>();
		const refs = new Map(
			['a', 'b'].map((id) => [id, (value: ObjectHostInstance | null) => refValues.set(id, value)]),
		);
		const attachers = new Map(
			['a', 'b'].map((id) => [
				id,
				() => {
					attachments.push(`attach:${id}`);
					return () => attachments.push(`cleanup:${id}`);
				},
			]),
		);
		const Scene = defineUniversalComponent(
			'object',
			(props: { order: readonly string[]; version: number }) =>
				props.order.map((id) =>
					universalComponent(
						'object',
						Wrapped,
						universalProps([
							['set', 'key', id],
							['set', 'label', `${id}:${props.version}`],
							['set', 'children', universalValue(detailPlan, [`detail:${id}:${props.version}`])],
							['set', 'ref', refs.get(id)!],
							['set', 'attach', attachers.get(id)!],
							['set', 'onSelect', () => events.push(`${id}:${props.version}`)],
							[
								'set',
								'onUpdate',
								(instance: ObjectHostInstance) => updates.push(String(instance.props.label)),
							],
						]),
					),
				),
		);

		expect(Wrapped).toBe(callable);
		root.render(Scene, { order: ['a', 'b'], version: 0 });
		const first = new Map(container.children.map((instance) => [instance.props.label, instance]));
		const details = new Map(container.children.map((instance) => [instance, instance.children[0]]));
		expect(container.children.map((instance) => instance.props.label)).toEqual(['a:0', 'b:0']);
		expect(attachments).toEqual(['attach:a', 'attach:b']);
		expect(refValues.get('a')).toBe(first.get('a:0'));
		container.dispatchEvent(first.get('b:0')!, 'select', undefined);
		expect(events).toEqual(['b:0']);

		root.render(Scene, { order: ['b', 'a'], version: 1 });
		expect(container.children).toEqual([first.get('b:0'), first.get('a:0')]);
		expect(container.children.map((instance) => instance.props.label)).toEqual(['b:1', 'a:1']);
		for (const instance of container.children) {
			expect(instance.children[0]).toBe(details.get(instance));
			expect(instance.children[0].props.label).toBe(`detail:${instance.props.label}`);
		}
		container.dispatchEvent(container.children[0], 'select', undefined);
		expect(events).toEqual(['b:0', 'b:1']);
		expect(updates).toEqual(['a:0', 'b:0', 'b:1', 'a:1']);

		root.render(Scene, { order: ['b'], version: 2 });
		expect(container.children).toEqual([first.get('b:0')]);
		expect(refValues.get('a')).toBeNull();
		expect(attachments).toEqual(['attach:a', 'attach:b', 'cleanup:b', 'attach:b', 'cleanup:a']);
		root.unmount();
		expect(refValues.get('b')).toBeNull();
		expect(attachments).toEqual([
			'attach:a',
			'attach:b',
			'cleanup:b',
			'attach:b',
			'cleanup:a',
			'cleanup:b',
		]);
	});

	it('preserves keyed host wrappers in compiler-proven compact leaf lists', () => {
		const container = createObjectContainer();
		const objectDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...objectDriver,
			capabilities: { ...objectDriver.capabilities, compilerLeafProps: true },
		});
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'wrapped',
			propsSlot: 0,
		});
		const Wrapped = markUniversalHostComponent(
			defineUniversalComponent<Record<string, unknown>>('object', (props) =>
				universalValue(plan, [universalProps([['spread', props]])]),
			),
			'object',
			plan,
		);
		const Scene = defineUniversalComponent(
			'object',
			(props: { items: readonly { id: string; value: number }[] }) =>
				universalFor(
					props.items,
					(item) => item.id,
					(item) => [item.value],
					null,
					true,
					true,
					Wrapped,
					universalHostComponentLeafPlan('object', Wrapped, '["value"]'),
					'["value"]',
				),
		);

		root.render(Scene, {
			items: [
				{ id: 'a', value: 1 },
				{ id: 'b', value: 2 },
			],
		});
		const [first, second] = container.children;
		root.render(Scene, {
			items: [
				{ id: 'b', value: 20 },
				{ id: 'a', value: 10 },
			],
		});
		expect(container.children).toEqual([second, first]);
		expect(container.children.map((instance) => instance.props.value)).toEqual([20, 10]);
		root.unmount();
	});

	it('rejects repeated mixed, unordered, NaN, signed-zero, and symbol keys in compact lists', () => {
		const container = createObjectContainer();
		const objectDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...objectDriver,
			capabilities: { ...objectDriver.capabilities, compilerLeafProps: true },
		});
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'keyed',
			bindings: [['value', 0]],
		});
		type Key = string | number | symbol | bigint;
		const Scene = defineUniversalComponent('object', (props: { keys: readonly Key[] }) =>
			universalFor(
				props.keys,
				(key) => key,
				(key) => [String(key)],
				null,
				true,
				true,
				undefined,
				plan,
			),
		);
		const shared = Symbol('shared');
		root.render(Scene, { keys: [1, 2, 3] });
		const committed = [...container.children];

		for (const keys of [
			[1, 2, 1],
			[1, '1', 1],
			[2, 1, 2],
			[NaN, NaN],
			[-0, 0],
			[shared, shared],
			[1n, 1n],
		] as readonly Key[][]) {
			expect(() => root.render(Scene, { keys })).toThrow(/Duplicate universal list key/);
			expect(container.children).toEqual(committed);
		}
		root.unmount();
	});

	it('keeps ordinary stateful components live when a specialized host guard is unavailable', () => {
		const container = createObjectContainer();
		const objectDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...objectDriver,
			capabilities: { ...objectDriver.capabilities, compilerLeafProps: true },
		});
		const plan = universalPlan('object', { kind: 'host', type: 'ordinary', propsSlot: 0 });
		const forgedPlan = universalPlan('object', {
			kind: 'host',
			type: 'ordinary',
			bindings: [['value', 0]],
		});
		const Ordinary = defineUniversalComponent<{ value: number }>('object', (props) => {
			const [increment, setIncrement] = useState(0, 'increment');
			return universalValue(plan, [
				universalProps([
					['set', 'value', props.value + increment],
					['set', 'onSelect', () => setIncrement((value) => value + 1)],
				]),
			]);
		});
		const Scene = defineUniversalComponent(
			'object',
			(props: { items: readonly { id: string; value: number }[] }) =>
				universalFor(
					props.items,
					(item) => item.id,
					(item) => [item.value],
					null,
					true,
					true,
					Ordinary,
					universalHostComponentLeafPlan('object', Ordinary, '["value"]') ?? forgedPlan,
					'["value"]',
				),
		);

		root.render(Scene, {
			items: [
				{ id: 'a', value: 1 },
				{ id: 'b', value: 2 },
			],
		});
		const [first, second] = container.children;
		flushUniversalSync(() => container.dispatchEvent(second, 'select', undefined));
		expect(second.props.value).toBe(3);
		root.render(Scene, {
			items: [
				{ id: 'b', value: 20 },
				{ id: 'a', value: 10 },
			],
		});
		expect(container.children).toEqual([second, first]);
		expect(container.children.map((instance) => instance.props.value)).toEqual([21, 10]);
		const WrongArity = defineUniversalComponent('object', () =>
			universalFor(
				[0],
				(value) => value,
				() => [],
				null,
				true,
				true,
				Ordinary,
				forgedPlan,
				'["value"]',
			),
		);
		expect(() => root.render(WrongArity, undefined)).toThrow(/signature and its values must match/);
		expect(container.children).toEqual([second, first]);
		root.unmount();
	});

	it('recreates a public instance under one logical ID and orders local callbacks, lifecycle, and refs', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const driver = {
			...baseDriver,
			updates: {
				classify(
					_type: string,
					previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					return previous.args === next.args ? ('update' as const) : ('recreate' as const);
				},
			},
		};
		const root = createUniversalRoot(container, driver);
		const labels = new WeakMap<object, string>();
		let nextLabel = 1;
		const label = (value: ObjectHostInstance) => {
			let current = labels.get(value);
			if (current === undefined) {
				current = `instance-${nextLabel++}`;
				labels.set(value, current);
			}
			return current;
		};
		const log: string[] = [];
		const attach = (_parent: ObjectHostInstance | null, self: ObjectHostInstance) => {
			const current = label(self);
			log.push(`attach:${current}`);
			return () => log.push(`attach-cleanup:${current}`);
		};
		const onUpdate = (self: ObjectHostInstance) => log.push(`update:${label(self)}`);
		const ref = (self: ObjectHostInstance | null) =>
			log.push(self === null ? 'ref:null' : `ref:${label(self)}`);
		const onSelect = () => log.push('event');
		const Scene = defineUniversalComponent(
			'object',
			(props: { args: readonly number[]; value: number }) =>
				universalValue(hostPlan, [
					universalProps([
						['set', 'args', props.args],
						['set', 'value', props.value],
						['set', 'attach', attach],
						['set', 'onUpdate', onUpdate],
						['set', 'onSelect', onSelect],
						['set', 'ref', ref],
					]),
				]),
		);
		const firstArgs = [1] as const;
		const secondArgs = [2] as const;

		root.render(Scene, { args: firstArgs, value: 1 });
		const first = container.children[0];
		const child = first.children[0];
		expect(log).toEqual(['attach:instance-1', 'update:instance-1', 'ref:instance-1']);
		container.dispatchEvent(first, 'select', undefined);
		expect(log.at(-1)).toBe('event');

		log.length = 0;
		root.render(Scene, { args: firstArgs, value: 2 });
		expect(container.children[0]).toBe(first);
		expect(log).toEqual(['update:instance-1']);

		log.length = 0;
		root.render(Scene, { args: secondArgs, value: 3 });
		const replacement = container.children[0];
		expect(replacement).not.toBe(first);
		expect(replacement.id).toBe(first.id);
		expect(replacement.children[0]).toBe(child);
		expect(log).toEqual([
			'attach-cleanup:instance-1',
			'attach:instance-2',
			'ref:null',
			'update:instance-2',
			'ref:instance-2',
		]);
		expect(() => container.dispatchEvent(first, 'select', undefined)).toThrow(
			/Object driver: stale event target/,
		);
		container.dispatchEvent(replacement, 'select', undefined);
		expect(log.at(-1)).toBe('event');

		log.length = 0;
		root.unmount();
		expect(log).toEqual(['attach-cleanup:instance-2', 'ref:null']);
	});

	it('publishes accepted topology and drains lifecycle/ref work after an apply fault', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let fail = true;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				return {
					...prepared,
					apply() {
						prepared.apply();
						if (fail) {
							fail = false;
							throw new Error('accepted apply fault');
						}
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('object', (props: { value: number }) =>
			universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'onSelect', () => log.push(`event:${props.value}`)],
					['set', 'onUpdate', (self: ObjectHostInstance) => log.push(`update:${self.props.value}`)],
					[
						'set',
						'ref',
						(self: ObjectHostInstance | null) => log.push(self ? 'ref:set' : 'ref:null'),
					],
				]),
			]),
		);

		expect(() => root.render(Scene, { value: 1 })).toThrow('accepted apply fault');
		expect(container.children[0].props.value).toBe(1);
		expect(log).toEqual(['update:1', 'ref:set']);
		expect(container.commits).toHaveLength(1);
		container.dispatchEvent(container.children[0], 'select', undefined);
		expect(log.at(-1)).toBe('event:1');

		root.render(Scene, { value: 2 });
		expect(container.children[0].props.value).toBe(2);
		expect(container.commits).toHaveLength(2);
		container.dispatchEvent(container.children[0], 'select', undefined);
		expect(log.at(-1)).toBe('event:2');
		root.unmount();
	});

	it('aborts staged host resources exactly once and never publishes them', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let staged = 0;
		let disposed = 0;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				staged += batch.commands.filter(
					(command) => command.op === 'create' || command.op === 'recreate',
				).length;
				const prepared = baseDriver.prepareBatch(target, batch, context);
				return {
					...prepared,
					abort() {
						disposed += batch.commands.filter(
							(command) => command.op === 'create' || command.op === 'recreate',
						).length;
						prepared.abort();
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const Scene = defineUniversalComponent('object', () => universalValue(hostPlan, [null]));
		const attempt = root.prepare(Scene, undefined);

		expect(attempt.status).toBe('prepared');
		expect(staged).toBe(2);
		expect(container.instanceCount).toBe(0);
		attempt.abort();
		attempt.abort();
		expect(disposed).toBe(2);
		expect(container.instanceCount).toBe(0);
		expect(container.commits).toHaveLength(0);
		root.unmount();
	});

	it('assigns monotonic batch versions across abort, rejection, supersession, and acceptance', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const versions: number[] = [];
		let reject = false;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				versions.push(batch.version);
				if (reject) throw new Error('host preflight rejected');
				return baseDriver.prepareBatch(target, batch, context);
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('object', (props: { value: number }) =>
			universalValue(plan, [universalProps([['set', 'value', props.value]])]),
		);

		const aborted = root.prepare(Scene, { value: 1 });
		expect(aborted.status).toBe('prepared');
		if (aborted.status === 'prepared') aborted.abort();

		reject = true;
		expect(() => root.prepare(Scene, { value: 2 })).toThrow('host preflight rejected');
		reject = false;

		const superseded = root.prepare(Scene, { value: 3 });
		const accepted = root.prepare(Scene, { value: 4 });
		expect(superseded.status).toBe('aborted');
		expect(accepted.status).toBe('prepared');
		if (accepted.status === 'prepared') accepted.commit();

		expect(versions).toEqual([1, 2, 3, 4]);
		expect(container.commits.map((batch) => batch.version)).toEqual([4]);
		expect(container.children[0].props.value).toBe(4);

		root.unmount();
		expect(versions).toEqual([1, 2, 3, 4, 5]);
		expect(container.commits.map((batch) => batch.version)).toEqual([4, 5]);
	});

	it('freezes commands and listener descriptors throughout the prepare-to-commit window', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
		});
		let events = 0;
		const Scene = defineUniversalComponent('object', () =>
			universalValue(plan, [universalProps([['set', 'onSelect', () => events++]])]),
		);
		const prepared = root.prepare(Scene, undefined);
		expect(prepared.status).toBe('prepared');
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared transaction.');

		expect(Object.isFrozen(prepared.batch)).toBe(true);
		expect(Object.isFrozen(prepared.batch.commands)).toBe(true);
		for (const command of prepared.batch.commands) expect(Object.isFrozen(command)).toBe(true);
		const create = prepared.batch.commands.find((command) => command.op === 'create');
		const event = prepared.batch.commands.find((command) => command.op === 'event');
		if (create?.op !== 'create' || event?.op !== 'event' || event.listener === null) {
			throw new Error('Expected create and published event commands.');
		}
		expect(Object.isFrozen(event.listener)).toBe(true);
		expect(() => {
			(create as unknown as { id: number }).id = 999;
		}).toThrow(TypeError);
		expect(() => {
			(event.listener as unknown as { id: number }).id = 999;
		}).toThrow(TypeError);

		prepared.commit();
		expect(container.children[0].id).toBe(create.id);
		container.dispatchEvent(container.children[0], 'select', undefined);
		expect(events).toBe(1);
		root.unmount();
	});

	it('mounts frozen intrinsic templates with dynamic text and live native events', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver());
		const log: string[] = [];
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['class', 0]],
			children: [
				{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] },
				{
					kind: 'host',
					type: 'action',
					propsSlot: 2,
					children: [{ kind: 'text', value: 'select' }],
				},
			],
		});
		const Scene = defineUniversalComponent('object', ({ value }: { value: string }) =>
			universalValue(rowPlan, [
				'row',
				value,
				universalProps([['set', 'onSelect', () => log.push(value)]]),
			]),
		);

		const prepared = root.prepare(Scene, { value: 'first' });
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		const template = prepared.batch.commands.find((command) => command.op === 'mount-template');
		if (template?.op !== 'mount-template') throw new Error('Expected a host template command.');
		expect(template.shape.map((node) => [node.type, node.parent])).toEqual([
			['row', -1],
			['label', 0],
			['#text', 1],
			['action', 0],
			['#text', 3],
		]);
		expect(Object.isFrozen(template)).toBe(true);
		expect(Object.isFrozen(template.shape)).toBe(true);
		expect(Object.isFrozen(template.nodes)).toBe(true);
		for (const node of template.nodes) {
			expect(Object.isFrozen(node)).toBe(true);
			expect(Object.isFrozen(node.props)).toBe(true);
			for (const event of node.events ?? []) {
				expect(Object.isFrozen(event)).toBe(true);
				expect(Object.isFrozen(event.listener)).toBe(true);
			}
		}

		prepared.commit();
		const row = container.children[0];
		expect(row.children.map((child) => child.type)).toEqual(['label', 'action']);
		expect(row.children[0].children[0].props.value).toBe('first');
		expect(row.children[1].children[0].props.value).toBe('select');
		container.dispatchEvent(row.children[1], 'select', undefined);
		expect(log).toEqual(['first']);

		root.render(Scene, { value: 'second' });
		expect(container.children[0]).toBe(row);
		expect(row.children[0].children[0].props.value).toBe('second');
		container.dispatchEvent(row.children[1], 'select', undefined);
		expect(log).toEqual(['first', 'second']);
		root.unmount();
	});

	it('inserts new intrinsic templates before retained siblings inside an existing host', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver());
		const framePlan = universalPlan('object', {
			kind: 'host',
			type: 'frame',
			children: [
				{ kind: 'slot', slot: 0 },
				{ kind: 'host', type: 'footer', props: { label: 'footer' } },
			],
		});
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 0 }] }],
		});
		let setVisible!: (visible: boolean) => void;
		const Rows = defineUniversalComponent('object', () => {
			const [visible, updateVisible] = useState(false, 'template-visible');
			setVisible = updateVisible;
			return visible
				? [universalValue(rowPlan, ['first']), universalValue(rowPlan, ['second'])]
				: null;
		});
		const Shell = defineUniversalComponent('object', () =>
			universalValue(framePlan, [universalComponent('object', Rows)]),
		);

		root.render(Shell, undefined);
		const frame = container.children[0];
		const footer = frame.children[0];
		flushUniversalSync(() => setVisible(true));
		expect(frame.children.map((child) => child.type)).toEqual(['row', 'row', 'footer']);
		expect(frame.children[0].children[0].children[0].props.value).toBe('first');
		expect(frame.children[1].children[0].children[0].props.value).toBe('second');
		expect(frame.children[2]).toBe(footer);

		flushUniversalSync(() => setVisible(false));
		expect(frame.children).toEqual([footer]);
		root.unmount();
	});

	it('falls back for refs, native-list hosts, and main-thread-owned props', () => {
		const cases = [
			{
				name: 'refs',
				root: {
					kind: 'host' as const,
					type: 'row',
					bindings: [['ref', 0] as const],
					children: [{ kind: 'host' as const, type: 'child' }],
				},
				values: [() => {}],
			},
			{
				name: 'native lists',
				root: {
					kind: 'host' as const,
					type: 'list',
					children: [{ kind: 'host' as const, type: 'list-item' }],
				},
				values: [],
			},
			{
				name: 'main-thread props',
				root: {
					kind: 'host' as const,
					type: 'row',
					props: { 'main-thread:custom': 'owned' },
					children: [{ kind: 'host' as const, type: 'child' }],
				},
				values: [],
			},
		];
		for (const example of cases) {
			const container = createObjectContainer();
			const root = createUniversalRoot(container, createTemplateObjectDriver());
			const plan = universalPlan('object', example.root);
			const Scene = defineUniversalComponent('object', () => universalValue(plan, example.values));
			const prepared = root.prepare(Scene, undefined);
			if (prepared.status !== 'prepared') throw new Error('Expected a prepared transaction.');
			expect(
				prepared.batch.commands.some((command) => command.op === 'mount-template'),
				example.name,
			).toBe(false);
			prepared.commit();
			expect(container.children[0].type, example.name).toBe(example.root.type);
			expect(container.children[0].children[0].type, example.name).toBe(
				example.root.children[0].type,
			);
			root.unmount();
		}
	});

	it('preserves stateful scalar prop codecs unless the renderer opts into stable encoding', () => {
		const container = createObjectContainer();
		const base = createTemplateObjectDriver();
		let revision = 0;
		const driver = {
			...base,
			props: {
				encode(context: { name: string; value: unknown }) {
					return {
						kind: 'value' as const,
						value:
							context.name === 'class' ? `${String(context.value)}:${++revision}` : context.value,
					};
				},
			},
		};
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			props: { class: 'item' },
			children: [{ kind: 'host', type: 'child' }],
		});
		const Scene = defineUniversalComponent('object', () => [
			universalValue(plan),
			universalValue(plan),
		]);
		const root = createUniversalRoot(container, driver);

		root.render(Scene, undefined);
		expect(container.children.map((row) => row.props.class)).toEqual(['item:1', 'item:2']);
		root.unmount();
	});

	it('abandons a staged intrinsic template without publishing hosts or event listeners', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver());
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [{ kind: 'host', type: 'action', propsSlot: 0 }],
		});
		const log: string[] = [];
		const Scene = defineUniversalComponent('object', () =>
			universalValue(plan, [universalProps([['set', 'onSelect', () => log.push('selected')]])]),
		);

		const abandoned = root.prepare(Scene, undefined);
		if (abandoned.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		expect(abandoned.batch.commands.some((command) => command.op === 'mount-template')).toBe(true);
		abandoned.abort();
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(log).toEqual([]);

		root.render(Scene, undefined);
		container.dispatchEvent(container.children[0].children[0], 'select', undefined);
		expect(log).toEqual(['selected']);
		root.unmount();
	});

	it('preserves template descendants, events, keyed order, deletion, and later refs', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true));
		const log: string[] = [];
		const refs: (ObjectHostInstance | null)[] = [];
		const hostRef = (instance: ObjectHostInstance | null) => refs.push(instance);
		const createRowPlan = (withRef: boolean) =>
			universalPlan('object', {
				kind: 'host',
				type: 'row',
				bindings: [['id', 0], ['selected', 1], ...(withRef ? ([['ref', 4]] as const) : [])],
				children: [
					{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 2 }] },
					{
						kind: 'host',
						type: 'action',
						bindings: [['onSelect', 3]],
						children: [{ kind: 'text', value: 'select' }],
					},
				],
			});
		const plainPlan = createRowPlan(false);
		const refPlan = createRowPlan(true);
		const Scene = defineUniversalComponent(
			'object',
			({
				items,
				selected,
				attachRef = false,
			}: {
				items: readonly { id: string; label: string }[];
				selected: string;
				attachRef?: boolean;
			}) =>
				items.map((item) =>
					universalValue(
						attachRef ? refPlan : plainPlan,
						[
							item.id,
							selected === item.id,
							item.label,
							() => log.push(`${item.id}:${selected}`),
							hostRef,
						],
						item.id,
					),
				),
		);

		root.render(Scene, {
			items: [
				{ id: 'a', label: 'Alpha' },
				{ id: 'b', label: 'Bravo' },
			],
			selected: 'a',
		});
		const first = container.children[0];
		const second = container.children[1];
		const firstLabel = first.children[0];
		const secondLabel = second.children[0];
		const firstText = firstLabel.children[0];
		const secondAction = second.children[1];
		container.dispatchEvent(secondAction, 'select', undefined);
		expect(log).toEqual(['b:a']);

		root.render(Scene, {
			items: [
				{ id: 'b', label: 'Bee' },
				{ id: 'a', label: 'Aye' },
			],
			selected: 'b',
		});
		expect(container.children).toEqual([second, first]);
		expect(second.children[0]).toBe(secondLabel);
		expect(first.children[0]).toBe(firstLabel);
		expect(first.children[0].children[0]).toBe(firstText);
		expect(secondLabel.children[0].props.value).toBe('Bee');
		expect(firstText.props.value).toBe('Aye');
		expect(second.props.selected).toBe(true);
		container.dispatchEvent(secondAction, 'select', undefined);
		container.dispatchEvent(first.children[1], 'select', undefined);
		expect(log).toEqual(['b:a', 'b:b', 'a:b']);

		root.render(Scene, { items: [{ id: 'b', label: 'Remaining' }], selected: 'b' });
		expect(container.children).toEqual([second]);
		expect(second.children[0]).toBe(secondLabel);
		expect(secondLabel.children[0].props.value).toBe('Remaining');
		expect(() => container.dispatchEvent(first, 'select', undefined)).toThrow(
			/Object driver: unknown event target/,
		);

		root.render(Scene, {
			items: [{ id: 'b', label: 'With ref' }],
			selected: 'b',
			attachRef: true,
		});
		expect(container.children[0]).toBe(second);
		expect(second.children[0]).toBe(secondLabel);
		expect(secondLabel.children[0].props.value).toBe('With ref');
		expect(refs).toEqual([second]);
		container.dispatchEvent(secondAction, 'select', undefined);
		expect(log.at(-1)).toBe('b:b');

		root.unmount();
		expect(refs).toEqual([second, null]);
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
	});

	it('keeps fallback template handlers atomic across many native event sites', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true));
		const calls: string[] = [];
		const sites = 32;
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: Array.from({ length: sites }, (_, index) => ({
				kind: 'host' as const,
				type: 'action',
				props: { index },
				bindings: [['onSelect', index * 2] as const, ['onPress', index * 2 + 1] as const],
			})),
		});
		const Scene = defineUniversalComponent(
			'object',
			({ version, inactive }: { version: string; inactive: ReadonlySet<number> }) =>
				universalValue(
					plan,
					Array.from({ length: sites * 2 }, (_, slot) => {
						const index = slot >> 1;
						const type = slot % 2 === 0 ? 'select' : 'press';
						if (type === 'select' && inactive.has(index)) return null;
						return () => calls.push(`${version}:${index}:${type}`);
					}),
				),
		);
		const noInactiveSites = new Set<number>();
		const sampled = [0, 15, 31];

		root.render(Scene, { version: 'accepted', inactive: noInactiveSites });
		const row = container.children[0];
		const actions = [...row.children];
		for (const index of sampled) {
			container.dispatchEvent(actions[index], 'select', undefined);
			container.dispatchEvent(actions[index], 'press', undefined);
		}
		expect(calls).toEqual(
			sampled.flatMap((index) => [`accepted:${index}:select`, `accepted:${index}:press`]),
		);

		const abandoned = root.prepare(Scene, {
			version: 'abandoned',
			inactive: noInactiveSites,
		});
		if (abandoned.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		abandoned.abort();
		container.dispatchEvent(actions[0], 'select', undefined);
		container.dispatchEvent(actions[15], 'press', undefined);
		expect(calls.slice(-2)).toEqual(['accepted:0:select', 'accepted:15:press']);

		const inactive = new Set(sampled);
		root.render(Scene, { version: 'next', inactive });
		expect(container.children[0]).toBe(row);
		expect(row.children).toEqual(actions);
		for (const index of sampled) {
			expect(() => container.dispatchEvent(actions[index], 'select', undefined)).toThrow(
				/no "select" listener/,
			);
			container.dispatchEvent(actions[index], 'press', undefined);
		}
		for (const index of [1, 16, 30]) {
			container.dispatchEvent(actions[index], 'select', undefined);
		}
		expect(calls.slice(-6)).toEqual([
			'next:0:press',
			'next:15:press',
			'next:31:press',
			'next:1:select',
			'next:16:select',
			'next:30:select',
		]);

		root.render(Scene, { version: 'restored', inactive: noInactiveSites });
		for (const index of sampled) {
			container.dispatchEvent(actions[index], 'select', undefined);
			container.dispatchEvent(actions[index], 'press', undefined);
		}
		expect(calls.slice(-6)).toEqual(
			sampled.flatMap((index) => [`restored:${index}:select`, `restored:${index}:press`]),
		);

		root.unmount();
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(() => container.dispatchEvent(actions[0], 'select', undefined)).toThrow(
			/Object driver: unknown event target/,
		);
	});

	it('shares immutable intrinsic programs while preserving keyed events, updates, and anchors', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true));
		const log: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			props: { class: 'item' },
			bindings: [
				['id', 0],
				['selected', 1],
			],
			children: [
				{
					kind: 'host',
					type: 'label',
					props: { class: 'label' },
					children: [{ kind: 'slot', slot: 2 }],
				},
				{
					kind: 'host',
					type: 'action',
					props: { class: 'action' },
					bindings: [['onSelect', 3]],
					children: [{ kind: 'text', value: 'select' }],
				},
			],
		});
		const Scene = defineUniversalComponent(
			'object',
			(props: { ids: readonly string[]; prefix: string; selected: string }) =>
				universalFor(
					props.ids,
					(id) => id,
					(id) =>
						universalValue(plan, [
							id,
							id === props.selected,
							`${props.prefix}-${id}`,
							() => log.push(`${props.prefix}:${id}`),
						]),
					null,
					false,
					false,
					true,
				),
		);

		const prepared = root.prepare(Scene, { ids: ['a', 'b'], prefix: 'first', selected: 'a' });
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		const ranges = prepared.batch.commands.filter(
			(command) => command.op === 'mount-template-range',
		);
		expect(ranges).toHaveLength(2);
		if (ranges[0].op !== 'mount-template-range' || ranges[1].op !== 'mount-template-range') {
			throw new Error('Expected program-backed intrinsic mounts.');
		}
		expect(ranges[0].program).toBe(ranges[1].program);
		expect(Object.isFrozen(ranges[0].program)).toBe(true);
		expect(Object.isFrozen(ranges[0].program.nodes)).toBe(true);
		expect(Object.isFrozen(ranges[0].program.events)).toBe(true);
		expect(Object.isFrozen(ranges[0].values)).toBe(true);
		for (const node of ranges[0].program.nodes) {
			expect(Object.isFrozen(node)).toBe(true);
			expect(Object.isFrozen(node.props)).toBe(true);
			if (node.bindings !== undefined) expect(Object.isFrozen(node.bindings)).toBe(true);
		}
		expect(ranges[0].program.nodes.map((node) => node.type)).toEqual([
			'row',
			'label',
			'#text',
			'action',
			'#text',
		]);
		expect(ranges[0].values).toEqual(['a', true, 'first-a']);
		expect(ranges[1].values).toEqual(['b', false, 'first-b']);
		expect(ranges[1].firstId).toBe(ranges[0].firstId + ranges[0].program.nodes.length);
		expect(ranges[1].firstListenerId).toBe(ranges[0].firstListenerId! + 1);
		prepared.commit();

		const [first, second] = container.children;
		expect(first.children[0].children[0].props.value).toBe('first-a');
		container.dispatchEvent(first.children[1], 'select', undefined);
		expect(log).toEqual(['first:a']);

		root.render(Scene, { ids: ['b', 'a'], prefix: 'second', selected: 'b' });
		expect(container.children).toEqual([second, first]);
		expect(second.props.selected).toBe(true);
		expect(first.children[0].children[0].props.value).toBe('second-a');
		container.dispatchEvent(first.children[1], 'select', undefined);
		expect(log).toEqual(['first:a', 'second:a']);

		root.render(Scene, { ids: ['c', 'a'], prefix: 'third', selected: 'c' });
		expect(container.children.map((row) => row.props.id)).toEqual(['c', 'a']);
		expect(container.children[1]).toBe(first);
		container.dispatchEvent(container.children[0].children[1], 'select', undefined);
		expect(log).toEqual(['first:a', 'second:a', 'third:c']);
		root.unmount();
	});

	it('ensures an opaque descendant before publishing newly added refs and callbacks', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true, true));
		const calls: string[] = [];
		const plain = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [{ kind: 'host', type: 'target', props: { label: 'stable' } }],
		});
		const observable = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [
				{
					kind: 'host',
					type: 'target',
					props: { label: 'stable' },
					bindings: [
						['ref', 0],
						['onUpdate', 1],
						['attach', 2],
					],
				},
			],
		});
		const ref = (instance: ObjectHostInstance | null) =>
			calls.push(instance === null ? 'ref:null' : `ref:${instance.props.label}`);
		const update = (instance: ObjectHostInstance) => calls.push(`update:${instance.props.label}`);
		const attach = (_parent: ObjectHostInstance, instance: ObjectHostInstance) => {
			calls.push(`attach:${instance.props.label}`);
		};
		const Scene = defineUniversalComponent('object', ({ visible }: { visible: boolean }) =>
			universalValue(visible ? observable : plain, visible ? [ref, update, attach] : []),
		);

		root.render(Scene, { visible: false });
		const target = container.children[0].children[0];
		const prepared = root.prepare(Scene, { visible: true });
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		const ensured = prepared.batch.commands.filter(
			(command) => command.op === 'ensure-public-instance',
		);
		expect(ensured).toEqual([{ op: 'ensure-public-instance', id: target.id }]);
		const ensureIndex = prepared.batch.commands.indexOf(ensured[0]);
		expect(
			prepared.batch.commands.findIndex((command) => command.op === 'lifecycle'),
		).toBeGreaterThan(ensureIndex);
		expect(
			prepared.batch.commands.findIndex((command) => command.op === 'local-callback'),
		).toBeGreaterThan(ensureIndex);
		prepared.commit();
		expect(container.children[0].children[0]).toBe(target);
		expect(calls).toContain('attach:stable');
		expect(calls).toContain('ref:stable');

		root.unmount();
		expect(calls.at(-1)).toBe('ref:null');
	});

	it('coalesces contiguous intrinsic rows while retaining independent event identities', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true, true, true));
		const selected: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['id', 0]],
			children: [
				{
					kind: 'host',
					type: 'action',
					bindings: [['onSelect', 1]],
					children: [{ kind: 'slot', slot: 2 }],
				},
			],
		});
		const Scene = defineUniversalComponent(
			'object',
			({ ids, label }: { ids: readonly string[]; label: string }) =>
				universalFor(
					ids,
					(id) => id,
					(id) =>
						universalValue(plan, [id, () => selected.push(`${label}:${id}`), `${label}-${id}`]),
					null,
					false,
					false,
					true,
				),
		);

		const prepared = root.prepare(Scene, { ids: ['a', 'b', 'c'], label: 'first' });
		if (prepared.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		const commands = prepared.batch.commands.filter(
			(command) => command.op === 'mount-template-run',
		);
		expect(commands).toHaveLength(1);
		const run = commands[0];
		if (run.op !== 'mount-template-run') throw new Error('Expected a contiguous intrinsic run.');
		expect(run.count).toBe(3);
		expect(run.values).toEqual(['a', 'first-a', 'b', 'first-b', 'c', 'first-c']);
		expect(Object.isFrozen(run)).toBe(true);
		expect(Object.isFrozen(run.values)).toBe(true);
		expect(run.program.nodes).toHaveLength(3);
		expect(run.program.events).toHaveLength(1);
		prepared.commit();
		const [first, second, third] = container.children;
		expect(container.children.map((row) => row.children[0].children[0].props.value)).toEqual([
			'first-a',
			'first-b',
			'first-c',
		]);
		container.dispatchEvent(second.children[0], 'select', undefined);
		container.dispatchEvent(third.children[0], 'select', undefined);
		expect(selected).toEqual(['first:b', 'first:c']);

		const append = root.prepare(Scene, { ids: ['a', 'b', 'c', 'd', 'e'], label: 'first' });
		if (append.status !== 'prepared') throw new Error('Expected an append transaction.');
		const appendRuns = append.batch.commands.filter(
			(command) => command.op === 'mount-template-run',
		);
		expect(appendRuns).toHaveLength(1);
		expect(appendRuns[0]).toMatchObject({ count: 2, before: null });
		append.commit();

		root.render(Scene, { ids: ['c', 'a'], label: 'next' });
		expect(container.children).toEqual([third, first]);
		expect(third.children[0].children[0].props.value).toBe('next-c');
		container.dispatchEvent(first.children[0], 'select', undefined);
		expect(selected).toEqual(['first:b', 'first:c', 'next:a']);

		const replace = root.prepare(Scene, { ids: ['x', 'y', 'z'], label: 'replace' });
		if (replace.status !== 'prepared') throw new Error('Expected a replacement transaction.');
		const replaceRuns = replace.batch.commands.filter(
			(command) => command.op === 'mount-template-run',
		);
		expect(replaceRuns).toHaveLength(1);
		expect(replaceRuns[0]).toMatchObject({ count: 3, before: null });
		replace.commit();
		root.unmount();
	});

	it('preserves keyed component state, context, events, and effects across a shared host mount', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true, true, true));
		const Theme = createContext('light');
		const effects: string[] = [];
		const events: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [
				['id', 0],
				['selected', 1],
			],
			children: [
				{
					kind: 'host',
					type: 'action',
					bindings: [['onSelect', 2]],
					children: [{ kind: 'slot', slot: 3 }],
				},
			],
		});
		const Row = defineUniversalComponent(
			'object',
			({ id, prefix, selected }: { id: string; prefix: string; selected: boolean }, context) => {
				const theme = context.readContext(Theme);
				const [state] = useState(`state:${id}`, 'row-state');
				context.layoutEffect(() => {
					effects.push(`mount:${id}`);
					return () => effects.push(`cleanup:${id}`);
				}, []);
				return universalValue(plan, [
					id,
					selected,
					() => events.push(`${prefix}:${theme}:${id}`),
					`${prefix}:${theme}:${state}`,
				]);
			},
		);
		const Scene = defineUniversalComponent(
			'object',
			({
				ids,
				prefix,
				theme,
				selected,
			}: {
				ids: readonly string[];
				prefix: string;
				theme: string;
				selected: string;
			}) =>
				universalContext(Theme, theme, () =>
					universalFor(
						ids,
						(id) => id,
						(id) =>
							universalComponent(
								'object',
								Row,
								universalProps(
									{ id, prefix, selected: id === selected } as never,
									undefined,
									false,
									true,
								),
							),
						null,
						false,
						false,
						undefined,
						undefined,
						undefined,
						true,
					),
				),
		);

		const input = { ids: ['a', 'b', 'c'], prefix: 'first', theme: 'light', selected: 'a' };
		const abandoned = root.prepare(Scene, input);
		if (abandoned.status !== 'prepared') throw new Error('Expected a prepared component mount.');
		const abandonedRuns = abandoned.batch.commands.filter(
			(command) => command.op === 'mount-template-run',
		);
		expect(abandonedRuns).toHaveLength(1);
		if (abandonedRuns[0].op !== 'mount-template-run') throw new Error('Expected a shared mount.');
		expect(abandonedRuns[0].count).toBe(3);
		expect(abandonedRuns[0].firstId).toBeGreaterThan(0);
		expect(effects).toEqual([]);
		abandoned.abort();
		expect(container.children).toEqual([]);
		expect(effects).toEqual([]);

		const prepared = root.prepare(Scene, input);
		if (prepared.status !== 'prepared') throw new Error('Expected a retried component mount.');
		const runs = prepared.batch.commands.filter((command) => command.op === 'mount-template-run');
		expect(runs).toHaveLength(1);
		if (runs[0].op !== 'mount-template-run') throw new Error('Expected a shared retry mount.');
		expect(runs[0].firstId).toBe(abandonedRuns[0].firstId);
		expect(runs[0].count).toBe(3);
		prepared.commit();
		const [first, second, third] = container.children;
		expect(effects).toEqual(['mount:a', 'mount:b', 'mount:c']);
		expect(container.children.map((row) => row.children[0].children[0].props.value)).toEqual([
			'first:light:state:a',
			'first:light:state:b',
			'first:light:state:c',
		]);
		container.dispatchEvent(second.children[0], 'select', undefined);
		expect(events).toEqual(['first:light:b']);

		root.render(Scene, { ...input, ids: ['c', 'a', 'b'] });
		expect(container.children).toEqual([third, first, second]);
		expect(effects).toEqual(['mount:a', 'mount:b', 'mount:c']);

		root.render(Scene, {
			ids: ['c', 'a', 'b'],
			prefix: 'next',
			theme: 'dark',
			selected: 'c',
		});
		expect(container.children).toEqual([third, first, second]);
		expect(third.props.selected).toBe(true);
		expect(first.children[0].children[0].props.value).toBe('next:dark:state:a');
		container.dispatchEvent(first.children[0], 'select', undefined);
		expect(events).toEqual(['first:light:b', 'next:dark:a']);

		root.render(Scene, { ids: ['b', 'c'], prefix: 'next', theme: 'dark', selected: 'c' });
		expect(container.children).toEqual([second, third]);
		expect(effects).toEqual(['mount:a', 'mount:b', 'mount:c', 'cleanup:a']);
		root.unmount();
		expect(effects.slice(4).toSorted()).toEqual(['cleanup:b', 'cleanup:c']);
	});

	it('preserves existing hosts when component mount capabilities become available later', () => {
		const container = createObjectContainer();
		const driver = createTemplateObjectDriver(true, true, true, false);
		const root = createUniversalRoot(container, driver);
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['id', 0]],
			children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] }],
		});
		const shellPlan = universalPlan('object', {
			kind: 'host',
			type: 'shell',
			children: [{ kind: 'slot', slot: 0 }],
		});
		const Row = defineUniversalComponent('object', ({ id }: { id: string }) =>
			universalValue(rowPlan, [id, `label:${id}`]),
		);
		const Scene = defineUniversalComponent('object', ({ ids }: { ids: readonly string[] }) =>
			universalValue(shellPlan, [
				universalFor(
					ids,
					(id) => id,
					(id) => universalComponent('object', Row, universalProps([['set', 'id', id]])),
					null,
					false,
					false,
					undefined,
					undefined,
					undefined,
					true,
				),
			]),
		);

		root.render(Scene, { ids: [] });
		const shell = container.children[0];
		const shellId = shell.id;
		driver.capabilities.templateProgramRuns = true;
		const prepared = root.prepare(Scene, { ids: ['a', 'b', 'c'] });
		if (prepared.status !== 'prepared') throw new Error('Expected a post-mount component batch.');
		const commands = prepared.batch.commands.filter(
			(command) => command.op === 'mount-template-run',
		);
		expect(commands).toHaveLength(1);
		if (commands[0].op !== 'mount-template-run') throw new Error('Expected a shared host mount.');
		expect(commands[0].count).toBe(3);
		expect(commands[0].parent).toBe(shellId);
		expect(commands[0].firstId).toBeGreaterThan(shellId);
		prepared.commit();
		expect(container.children).toEqual([shell]);
		expect(shell.children.map((row) => row.children[0].children[0].props.value)).toEqual([
			'label:a',
			'label:b',
			'label:c',
		]);
		root.unmount();
	});

	it('tears down a cleared collapsed run with one destroy-run command', () => {
		const container = createObjectContainer();
		const driver = createTemplateObjectDriver(true, true, true, true);
		(driver.capabilities as { teardownRuns?: boolean }).teardownRuns = true;
		const root = createUniversalRoot(container, driver);
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['id', 0]],
			children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] }],
		});
		const shellPlan = universalPlan('object', {
			kind: 'host',
			type: 'shell',
			children: [{ kind: 'slot', slot: 0 }],
		});
		const Row = defineUniversalComponent('object', ({ id }: { id: string }) =>
			universalValue(rowPlan, [id, `label:${id}`]),
		);
		const Scene = defineUniversalComponent('object', ({ ids }: { ids: readonly string[] }) =>
			universalValue(shellPlan, [
				universalFor(
					ids,
					(id) => id,
					(id) => universalComponent('object', Row, universalProps([['set', 'id', id]])),
					null,
					false,
					false,
					undefined,
					undefined,
					undefined,
					true,
				),
			]),
		);

		root.render(Scene, { ids: [] });
		const shell = container.children[0];
		const shellId = shell.id;
		root.render(Scene, { ids: ['a', 'b', 'c'] });
		expect(shell.children).toHaveLength(3);
		const firstRowId = shell.children[0].id;

		const prepared = root.prepare(Scene, { ids: [] });
		if (prepared.status !== 'prepared') throw new Error('Expected a teardown batch.');
		expect(prepared.batch.commands).toEqual([
			{ op: 'destroy-run', parent: shellId, firstId: firstRowId, count: 3, width: 3 },
		]);
		prepared.commit();
		expect(shell.children).toEqual([]);

		// The run remounts and clears again without per-host teardown reappearing.
		root.render(Scene, { ids: ['d', 'e'] });
		expect(shell.children).toHaveLength(2);
		const cleared = root.prepare(Scene, { ids: [] });
		if (cleared.status !== 'prepared') throw new Error('Expected a second teardown batch.');
		expect(cleared.batch.commands.every((command) => command.op === 'destroy-run')).toBe(true);
		cleared.commit();
		expect(shell.children).toEqual([]);
		root.unmount();
	});

	it('retains already-adopted keyed component scopes when mounting capabilities upgrade', () => {
		const container = createObjectContainer();
		const driver = createTemplateObjectDriver(true, true, true, false);
		const root = createUniversalRoot(container, driver);
		const effects: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['id', 0]],
			children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 1 }] }],
		});
		const Row = defineUniversalComponent('object', ({ id }: { id: string }) => {
			const [state] = useState(`retained:${id}`, 'row-state');
			useLayoutEffect(
				() => {
					effects.push(`mount:${id}`);
					return () => effects.push(`cleanup:${id}`);
				},
				[],
				'row-effect',
			);
			return universalValue(plan, [id, state]);
		});
		const Scene = defineUniversalComponent('object', ({ ids }: { ids: readonly string[] }) =>
			universalFor(
				ids,
				(id) => id,
				(id) =>
					universalComponent(
						'object',
						Row,
						universalProps({ id } as never, undefined, false, true),
					),
				null,
				false,
				false,
				undefined,
				undefined,
				undefined,
				true,
			),
		);

		root.render(Scene, { ids: ['a', 'b'] });
		const [first, second] = container.children;
		expect(effects).toEqual(['mount:a', 'mount:b']);
		driver.capabilities.templateProgramRuns = true;
		root.render(Scene, { ids: ['b', 'a'] });
		expect(container.children).toEqual([second, first]);
		expect(container.children.map((row) => row.children[0].children[0].props.value)).toEqual([
			'retained:b',
			'retained:a',
		]);
		expect(effects).toEqual(['mount:a', 'mount:b']);
		root.unmount();
		expect(effects.slice(2).toSorted()).toEqual(['cleanup:a', 'cleanup:b']);
	});

	it('keeps an item owner when a component-prop getter reads keyed hook state', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true, true, true));
		const effects: string[] = [];
		let setGetterValue!: (next: string) => void;
		let setRowValue!: (next: string) => void;
		const item = {
			id: 'one',
			get label() {
				const [label, setLabel] = useState('getter:first', 'getter-slot');
				setGetterValue = setLabel;
				return label;
			},
		};
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [{ kind: 'host', type: 'label', children: [{ kind: 'slot', slot: 0 }] }],
		});
		const Row = defineUniversalComponent('object', ({ label }: { label: string }) => {
			const [value, update] = useState('row:first', 'row-slot');
			setRowValue = update;
			useLayoutEffect(
				() => {
					effects.push('mount');
					return () => effects.push('cleanup');
				},
				[],
				'row-effect',
			);
			return universalValue(plan, [`${label}|${value}`]);
		});
		const Scene = defineUniversalComponent('object', () =>
			universalFor(
				[item],
				(entry) => entry.id,
				(entry) =>
					universalComponent(
						'object',
						Row,
						universalProps({ label: entry.label } as never, undefined, false, true),
					),
				null,
				false,
				false,
				undefined,
				undefined,
				undefined,
				true,
			),
		);

		root.render(Scene, undefined);
		const row = container.children[0];
		expect(row.children[0].children[0].props.value).toBe('getter:first|row:first');
		expect(effects).toEqual(['mount']);

		flushUniversalSync(() => setGetterValue('getter:next'));
		expect(container.children).toEqual([row]);
		expect(row.children[0].children[0].props.value).toBe('getter:next|row:first');
		expect(effects).toEqual(['mount']);

		flushUniversalSync(() => setRowValue('row:next'));
		expect(container.children).toEqual([row]);
		expect(row.children[0].children[0].props.value).toBe('getter:next|row:next');
		expect(effects).toEqual(['mount']);
		root.unmount();
		expect(effects).toEqual(['mount', 'cleanup']);
	});

	it('commits stable compact list state and event closures only after host acceptance', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true, true, true));
		const events: string[] = [];
		const shellPlan = universalPlan('object', {
			kind: 'host',
			type: 'shell',
			children: [
				{ kind: 'host', type: 'summary', children: [{ kind: 'slot', slot: 0 }] },
				{ kind: 'host', type: 'table', children: [{ kind: 'slot', slot: 1 }] },
			],
		});
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [
				['id', 0],
				['selected', 1],
			],
			children: [
				{
					kind: 'host',
					type: 'action',
					bindings: [['onSelect', 2]],
					children: [{ kind: 'slot', slot: 3 }],
				},
			],
		});
		const Scene = defineUniversalComponent(
			'object',
			({ ids, prefix }: { ids: readonly string[]; prefix: string }) => {
				const [selected, setSelected] = useState('a', 'compact-selected');
				return universalValue(shellPlan, [
					`${prefix}:${selected}`,
					universalFor(
						ids,
						(id) => id,
						(id) =>
							universalValue(rowPlan, [
								id,
								selected === id,
								() => {
									events.push(`${prefix}:${id}:${selected}`);
									setSelected(id);
								},
								`${prefix}-${id}`,
							]),
						null,
						false,
						false,
						true,
					),
				]);
			},
		);

		root.render(Scene, { ids: ['a', 'b'], prefix: 'accepted' });
		const shell = container.children[0];
		const summary = shell.children[0].children[0];
		const [first, second] = shell.children[1].children;
		expect(summary.props.value).toBe('accepted:a');
		container.dispatchEvent(second.children[0], 'select', undefined);
		expect(events).toEqual(['accepted:b:a']);
		expect(summary.props.value).toBe('accepted:b');
		expect(first.props.selected).toBe(false);
		expect(second.props.selected).toBe(true);
		expect(shell.children[1].children).toEqual([first, second]);

		const abandoned = root.prepare(Scene, { ids: ['a', 'b'], prefix: 'abandoned' });
		if (abandoned.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		abandoned.abort();
		expect(summary.props.value).toBe('accepted:b');
		expect(first.children[0].children[0].props.value).toBe('accepted-a');
		container.dispatchEvent(first.children[0], 'select', undefined);
		expect(events).toEqual(['accepted:b:a', 'accepted:a:b']);
		expect(summary.props.value).toBe('accepted:a');

		root.render(Scene, { ids: ['a', 'b'], prefix: 'next' });
		expect(summary.props.value).toBe('next:a');
		expect(first.children[0].children[0].props.value).toBe('next-a');
		container.dispatchEvent(second.children[0], 'select', undefined);
		expect(events.at(-1)).toBe('next:b:a');
		expect(summary.props.value).toBe('next:b');
		root.unmount();
	});

	it('keeps compact handler replacements atomic and restores nullable listener sites', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true, true, true));
		const calls: string[] = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [
				{
					kind: 'host',
					type: 'action',
					bindings: [['onSelect', 0]],
					children: [{ kind: 'slot', slot: 1 }],
				},
			],
		});
		const Scene = defineUniversalComponent(
			'object',
			({ value, active }: { value: string; active: boolean }) =>
				universalValue(plan, [active ? () => calls.push(value) : null, value]),
		);

		root.render(Scene, { value: 'accepted', active: true });
		const action = container.children[0].children[0];
		container.dispatchEvent(action, 'select', undefined);
		expect(calls).toEqual(['accepted']);

		const abandoned = root.prepare(Scene, { value: 'abandoned', active: true });
		if (abandoned.status !== 'prepared') throw new Error('Expected a prepared transaction.');
		abandoned.abort();
		expect(action.children[0].props.value).toBe('accepted');
		container.dispatchEvent(action, 'select', undefined);
		expect(calls).toEqual(['accepted', 'accepted']);

		root.render(Scene, { value: 'inactive', active: false });
		expect(container.children[0].children[0]).toBe(action);
		expect(action.children[0].props.value).toBe('inactive');
		expect(() => container.dispatchEvent(action, 'select', undefined)).toThrow(
			/no "select" listener/,
		);

		root.render(Scene, { value: 'restored', active: true });
		expect(container.children[0].children[0]).toBe(action);
		expect(action.children[0].props.value).toBe('restored');
		container.dispatchEvent(action, 'select', undefined);
		expect(calls).toEqual(['accepted', 'accepted', 'restored']);
		root.unmount();
	});

	it('tears down untouched intrinsic template descendants and their native events', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createTemplateObjectDriver(true));
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			children: [
				{
					kind: 'host',
					type: 'action',
					bindings: [['onSelect', 0]],
					children: [{ kind: 'text', value: 'select' }],
				},
			],
		});
		const Scene = defineUniversalComponent('object', () => universalValue(plan, [() => {}]));
		root.render(Scene, undefined);
		const action = container.children[0].children[0];
		container.dispatchEvent(action, 'select', undefined);

		root.unmount();
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(() => container.dispatchEvent(action, 'select', undefined)).toThrow(
			/Object driver: unknown event target/,
		);
	});

	it('finishes committed teardown when a pending host abort throws and rethrows that first fault', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let failAbort = false;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				return {
					...prepared,
					abort() {
						prepared.abort();
						if (failAbort) throw new Error('pending abort fault');
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
		});
		const log: string[] = [];
		let refValue: ObjectHostInstance | null = null;
		const ref = (value: ObjectHostInstance | null) => {
			refValue = value;
			log.push(value === null ? 'ref:null' : 'ref:set');
		};
		const attach = () => {
			log.push('attach');
			return () => log.push('attach:cleanup');
		};
		const Scene = defineUniversalComponent('object', (props: { value: number }) => {
			useLayoutEffect(
				() => {
					log.push('layout:mount');
					return () => {
						log.push('layout:cleanup');
						throw new Error('later layout cleanup fault');
					};
				},
				[],
				'layout',
			);
			return universalValue(plan, [
				universalProps([
					['set', 'value', props.value],
					['set', 'attach', attach],
					['set', 'onSelect', () => log.push('event')],
					['set', 'ref', ref],
				]),
			]);
		});

		root.render(Scene, { value: 1 });
		const committed = container.children[0];
		expect(refValue).toBe(committed);
		failAbort = true;
		const pending = root.prepare(Scene, { value: 2 });
		expect(pending.status).toBe('prepared');

		expect(() => root.unmount()).toThrow('pending abort fault');
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(refValue).toBe(null);
		expect(log.filter((entry) => entry === 'attach:cleanup')).toHaveLength(1);
		expect(log.filter((entry) => entry === 'layout:cleanup')).toHaveLength(1);
		expect(log.filter((entry) => entry === 'ref:null')).toHaveLength(1);
		expect(() => container.dispatchEvent(committed, 'select', undefined)).toThrow(
			/Object driver: unknown event target/,
		);
		expect(() => root.render(Scene, { value: 3 })).toThrow(/unmounted universal root/);
	});

	it('keeps an accepted recreate public when local cleanup and lifecycle callbacks throw', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const driver = {
			...baseDriver,
			updates: {
				classify(
					_type: string,
					previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					return previous.args === next.args ? ('update' as const) : ('recreate' as const);
				},
			},
		};
		const root = createUniversalRoot(container, driver);
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
		});
		const log: string[] = [];
		const attach = (_parent: ObjectHostInstance | null, self: ObjectHostInstance) => {
			const value = self.props.value;
			log.push(`attach:${value}`);
			return () => {
				log.push(`attach-cleanup:${value}`);
				if (value === 1) throw new Error('attach cleanup fault');
			};
		};
		const ref = (self: ObjectHostInstance | null) =>
			log.push(self === null ? 'ref:null' : `ref:${self.props.value}`);
		const onUpdate = (self: ObjectHostInstance) => {
			log.push(`update:${self.props.value}`);
			if (self.props.value === 2) throw new Error('lifecycle fault');
		};
		const Scene = defineUniversalComponent(
			'object',
			(props: { args: readonly number[]; value: number }) => {
				useLayoutEffect(
					() => {
						log.push(`layout:${props.value}`);
						return () => log.push(`layout-cleanup:${props.value}`);
					},
					[props.value],
					'layout',
				);
				return universalValue(plan, [
					universalProps([
						['set', 'args', props.args],
						['set', 'value', props.value],
						['set', 'attach', attach],
						['set', 'onSelect', () => log.push(`event:${props.value}`)],
						['set', 'onUpdate', onUpdate],
						['set', 'ref', ref],
					]),
				]);
			},
		);
		const firstArgs = [1] as const;
		const secondArgs = [2] as const;

		root.render(Scene, { args: firstArgs, value: 1 });
		const first = container.children[0];
		log.length = 0;

		expect(() => root.render(Scene, { args: secondArgs, value: 2 })).toThrow(
			'attach cleanup fault',
		);
		const replacement = container.children[0];
		expect(replacement).not.toBe(first);
		expect(replacement.id).toBe(first.id);
		expect(log).toEqual([
			'attach-cleanup:1',
			'attach:2',
			'layout-cleanup:1',
			'ref:null',
			'update:2',
			'ref:2',
			'layout:2',
		]);
		container.dispatchEvent(replacement, 'select', undefined);
		expect(log.at(-1)).toBe('event:2');
		expect(container.commits).toHaveLength(2);

		root.unmount();
		expect(log).toContain('attach-cleanup:2');
		expect(log).toContain('layout-cleanup:2');
	});

	it('preserves an accepted recreate target and its publications across abort and preflight reject', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let rejectRecreate = false;
		let stagedReplacements = 0;
		let disposedReplacements = 0;
		const driver = {
			...baseDriver,
			updates: {
				classify(
					_type: string,
					previous: Readonly<Record<string, unknown>>,
					next: Readonly<Record<string, unknown>>,
				) {
					return previous.args === next.args ? ('update' as const) : ('recreate' as const);
				},
			},
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const recreates = batch.commands.filter((command) => command.op === 'recreate').length;
				const prepared = baseDriver.prepareBatch(target, batch, context);
				stagedReplacements += recreates;
				if (rejectRecreate && recreates > 0) {
					disposedReplacements += recreates;
					prepared.abort();
					throw new Error('recreate preflight rejected');
				}
				return {
					...prepared,
					abort() {
						disposedReplacements += recreates;
						prepared.abort();
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const log: string[] = [];
		let currentRef: ObjectHostInstance | null = null;
		const ref = (value: ObjectHostInstance | null) => {
			currentRef = value;
			log.push(value === null ? 'ref:null' : `ref:${value.props.value}`);
		};
		const attach = (_parent: ObjectHostInstance | null, self: ObjectHostInstance) => {
			log.push(`attach:${self.props.value}`);
			return () => log.push(`attach-cleanup:${self.props.value}`);
		};
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
			children: [{ kind: 'host', type: 'child' }],
		});
		const Scene = defineUniversalComponent(
			'object',
			(props: { args: readonly number[]; value: number; event: string }) =>
				universalValue(plan, [
					universalProps([
						['set', 'args', props.args],
						['set', 'value', props.value],
						['set', 'attach', attach],
						['set', 'onSelect', () => log.push(`event:${props.event}`)],
						['set', 'ref', ref],
					]),
				]),
		);
		const acceptedArgs = [1] as const;
		const abortedArgs = [2] as const;
		const rejectedArgs = [3] as const;

		root.render(Scene, { args: acceptedArgs, value: 1, event: 'accepted' });
		const accepted = container.children[0];
		const acceptedChild = accepted.children[0];
		log.length = 0;

		const aborted = root.prepare(Scene, { args: abortedArgs, value: 2, event: 'aborted' });
		expect(aborted.status).toBe('prepared');
		if (aborted.status === 'prepared') aborted.abort();
		expect(stagedReplacements).toBe(1);
		expect(disposedReplacements).toBe(1);
		expect(container.children[0]).toBe(accepted);
		expect(accepted.children[0]).toBe(acceptedChild);
		expect(currentRef).toBe(accepted);
		expect(log).toEqual([]);
		container.dispatchEvent(accepted, 'select', undefined);
		expect(log).toEqual(['event:accepted']);

		log.length = 0;
		rejectRecreate = true;
		expect(() => root.prepare(Scene, { args: rejectedArgs, value: 3, event: 'rejected' })).toThrow(
			'recreate preflight rejected',
		);
		expect(stagedReplacements).toBe(2);
		expect(disposedReplacements).toBe(2);
		expect(container.children[0]).toBe(accepted);
		expect(accepted.children[0]).toBe(acceptedChild);
		expect(currentRef).toBe(accepted);
		expect(log).toEqual([]);
		container.dispatchEvent(accepted, 'select', undefined);
		expect(log).toEqual(['event:accepted']);

		rejectRecreate = false;
		root.unmount();
		expect(log.slice(-2)).toEqual(['attach-cleanup:1', 'ref:null']);
	});

	it('routes an accepted lifecycle fault to the nearest universal error owner', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const bodyPlan = universalPlan('object', {
			kind: 'host',
			type: 'node',
			propsSlot: 0,
		});
		const innerCatchPlan = universalPlan('object', {
			kind: 'host',
			type: 'inner-catch',
			propsSlot: 0,
		});
		const outerCatchPlan = universalPlan('object', {
			kind: 'host',
			type: 'outer-catch',
			propsSlot: 0,
		});
		const lifecycleLog: number[] = [];
		const Child = defineUniversalComponent('object', (props: { value: number }) =>
			universalValue(bodyPlan, [
				universalProps([
					['set', 'value', props.value],
					[
						'set',
						'onUpdate',
						(self: ObjectHostInstance) => {
							const value = self.props.value as number;
							lifecycleLog.push(value);
							if (value === 2) throw new Error('owned lifecycle fault');
						},
					],
				]),
			]),
		);
		const Inner = defineUniversalComponent('object', (props: { value: number }) =>
			universalTry(
				() => universalComponent('object', Child, props),
				null,
				(error) =>
					universalValue(innerCatchPlan, [
						universalProps([['set', 'value', (error as Error).message]]),
					]),
			),
		);
		const Outer = defineUniversalComponent('object', (props: { value: number }) =>
			universalTry(
				() => universalComponent('object', Inner, props),
				null,
				(error) =>
					universalValue(outerCatchPlan, [
						universalProps([['set', 'value', (error as Error).message]]),
					]),
			),
		);

		root.render(Outer, { value: 1 });
		const accepted = container.children[0];
		expect(accepted).toMatchObject({ type: 'node', props: { value: 1 } });

		expect(() => root.render(Outer, { value: 2 })).not.toThrow();
		expect(container.children[0]).toBe(accepted);
		expect(accepted.props.value).toBe(2);
		expect(lifecycleLog).toEqual([1, 2]);
		expect(container.commits).toHaveLength(2);

		await Promise.resolve();
		expect(container.children[0]).toMatchObject({
			type: 'inner-catch',
			props: { value: 'owned lifecycle fault' },
		});
		expect(container.commits).toHaveLength(3);
		root.unmount();
	});
});
