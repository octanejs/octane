import { describe, expect, it } from 'vitest';
import {
	type ObjectHostInstance,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalActivity,
	universalComponent,
	universalPlan,
	universalProps,
	universalValue,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useState,
} from '../src/universal.js';
import { CompiledUniversalActivity } from './_fixtures/universal-activity.object.tsrx';

const hostPlan = universalPlan('object', {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
});

async function flushUniversalWork(count = 3) {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

describe('universal Activity visibility', () => {
	it('executes compiler-lowered Activity through the selected renderer', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const refs: Array<ObjectHostInstance | null> = [];
		const hostRef = (value: ObjectHostInstance | null) => refs.push(value);

		root.render(CompiledUniversalActivity, { mode: 'hidden', hostRef });
		const instance = container.children[0];
		expect(instance.visible).toBe(false);
		expect(refs).toEqual([instance]);
		root.render(CompiledUniversalActivity, { mode: 'visible', hostRef });
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(true);
		expect(refs).toEqual([instance]);
		root.unmount();
	});

	it('preserves the host, state, and ref while disconnecting effects and events', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const log: string[] = [];
		const refs: Array<ObjectHostInstance | null> = [];
		const hostRef = (value: ObjectHostInstance | null) => refs.push(value);
		let updateState!: (value: (previous: number) => number) => void;
		const Child = defineUniversalComponent(
			'object',
			(props: { version: number; onPress: () => void }) => {
				const [count, setCount] = useState(0, 'state');
				updateState = setCount;
				log.push(`render:${count}`);
				useInsertionEffect(
					() => {
						log.push(`insertion mount:${props.version}`);
						return () => log.push(`insertion cleanup:${props.version}`);
					},
					[props.version],
					'insertion',
				);
				useLayoutEffect(
					() => {
						log.push('layout mount');
						return () => log.push('layout cleanup');
					},
					[],
					'layout',
				);
				useEffect(
					() => {
						log.push('passive mount');
						return () => log.push('passive cleanup');
					},
					[],
					'passive',
				);
				return universalValue(hostPlan, [
					universalProps([
						['set', 'value', count],
						['set', 'onPress', props.onPress],
						['set', 'ref', hostRef],
					]),
				]);
			},
		);
		const Scene = defineUniversalComponent(
			'object',
			(props: { mode: 'visible' | 'hidden'; version: number; onPress: () => void }) =>
				universalActivity(props.mode, () =>
					universalComponent('object', Child, {
						version: props.version,
						onPress: props.onPress,
					}),
				),
		);
		const onPress = () => log.push('press');

		root.render(Scene, { mode: 'hidden', version: 0, onPress });
		await flushUniversalWork();
		const instance = container.children[0];
		expect(instance.visible).toBe(false);
		expect(refs).toEqual([instance]);
		expect(log).toEqual(['render:0', 'insertion mount:0']);
		expect(() => container.dispatchEvent(instance, 'press', undefined)).toThrow(
			/no "press" listener/,
		);

		log.length = 0;
		root.render(Scene, { mode: 'hidden', version: 1, onPress });
		await flushUniversalWork();
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(false);
		expect(log).toEqual(['render:0', 'insertion cleanup:0', 'insertion mount:1']);

		log.length = 0;
		root.render(Scene, { mode: 'visible', version: 1, onPress });
		await flushUniversalWork();
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(true);
		expect(refs).toEqual([instance]);
		expect(log).toEqual(['render:0', 'layout mount', 'passive mount']);
		container.dispatchEvent(instance, 'press', undefined);
		expect(log.at(-1)).toBe('press');

		log.length = 0;
		updateState((value) => value + 1);
		await flushUniversalWork();
		expect(instance.props.value).toBe(1);
		expect(log).toContain('render:1');

		log.length = 0;
		root.render(Scene, { mode: 'hidden', version: 1, onPress });
		await flushUniversalWork();
		expect(container.children[0]).toBe(instance);
		expect(instance.props.value).toBe(1);
		expect(instance.visible).toBe(false);
		expect(refs).toEqual([instance]);
		expect(log).toEqual(['render:1', 'layout cleanup', 'passive cleanup']);
		expect(() => container.dispatchEvent(instance, 'press', undefined)).toThrow(
			/no "press" listener/,
		);

		root.unmount();
		await flushUniversalWork();
		expect(refs.at(-1)).toBeNull();
		expect(log.at(-1)).toBe('insertion cleanup:1');
	});

	it('disconnects parent-first and reconnects child-first', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const log: string[] = [];
		const effectComponent = (name: string, child: (() => unknown) | null = null) =>
			defineUniversalComponent('object', () => {
				useLayoutEffect(
					() => {
						log.push(`layout mount:${name}`);
						return () => log.push(`layout cleanup:${name}`);
					},
					[],
					`${name}:layout`,
				);
				useEffect(
					() => {
						log.push(`passive mount:${name}`);
						return () => log.push(`passive cleanup:${name}`);
					},
					[],
					`${name}:passive`,
				);
				return child === null ? universalValue(hostPlan, [universalProps([])]) : child();
			});
		const Child = effectComponent('child');
		const Parent = effectComponent('parent', () => universalComponent('object', Child, {}));
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalActivity(props.mode, () => universalComponent('object', Parent, {})),
		);

		root.render(Scene, { mode: 'visible' });
		await flushUniversalWork();
		expect(log).toEqual([
			'layout mount:child',
			'layout mount:parent',
			'passive mount:child',
			'passive mount:parent',
		]);

		log.length = 0;
		root.render(Scene, { mode: 'hidden' });
		await flushUniversalWork();
		expect(log).toEqual([
			'layout cleanup:parent',
			'layout cleanup:child',
			'passive cleanup:parent',
			'passive cleanup:child',
		]);

		log.length = 0;
		root.render(Scene, { mode: 'visible' });
		await flushUniversalWork();
		expect(log).toEqual([
			'layout mount:child',
			'layout mount:parent',
			'passive mount:child',
			'passive mount:parent',
		]);
		root.unmount();
	});

	it('composes nested hidden modes without changing host identity', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent(
			'object',
			(props: { outer: 'visible' | 'hidden'; inner: 'visible' | 'hidden' }) =>
				universalActivity(props.outer, () =>
					universalActivity(props.inner, () => universalValue(hostPlan, [universalProps([])])),
				),
		);

		root.render(Scene, { outer: 'hidden', inner: 'visible' });
		const instance = container.children[0];
		expect(instance.visible).toBe(false);
		root.render(Scene, { outer: 'visible', inner: 'visible' });
		expect(container.children[0]).toBe(instance);
		expect(instance.visible).toBe(true);
		root.render(Scene, { outer: 'hidden', inner: 'hidden' });
		expect(instance.visible).toBe(false);
		root.render(Scene, { outer: 'visible', inner: 'hidden' });
		expect(instance.visible).toBe(false);
		root.render(Scene, { outer: 'visible', inner: 'visible' });
		expect(instance.visible).toBe(true);
		root.unmount();
	});

	it('keeps accepted visibility unchanged when a prepared transition aborts or preflight rejects', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let rejectVisibility = false;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				if (rejectVisibility && batch.commands.some((command) => command.op === 'visibility')) {
					throw new Error('visibility preflight rejected');
				}
				return baseDriver.prepareBatch(target, batch, context);
			},
		};
		const root = createUniversalRoot(container, driver);
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalActivity(props.mode, () => universalValue(hostPlan, [universalProps([])])),
		);

		root.render(Scene, { mode: 'visible' });
		const instance = container.children[0];
		const prepared = root.prepare(Scene, { mode: 'hidden' });
		expect(prepared.status).toBe('prepared');
		expect(instance.visible).toBe(true);
		prepared.abort();
		expect(instance.visible).toBe(true);

		rejectVisibility = true;
		expect(() => root.prepare(Scene, { mode: 'hidden' })).toThrow('visibility preflight rejected');
		expect(instance.visible).toBe(true);
		root.unmount();
	});

	it('publishes a hidden recreate atomically after an apply fault and reconnects it on reveal', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let failHiddenRecreate = false;
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
				const prepared = baseDriver.prepareBatch(target, batch, context);
				const hiddenRecreate =
					batch.commands.some((command) => command.op === 'recreate') &&
					batch.commands.some(
						(command) => command.op === 'visibility' && command.state === 'hidden',
					);
				return {
					...prepared,
					apply() {
						prepared.apply();
						if (failHiddenRecreate && hiddenRecreate) {
							failHiddenRecreate = false;
							throw new Error('accepted hidden apply fault');
						}
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const log: string[] = [];
		let accepted!: ObjectHostInstance;
		let currentRef: ObjectHostInstance | null = null;
		const identity = (self: ObjectHostInstance) => (self === accepted ? 'accepted' : 'replacement');
		const visibility = (self: ObjectHostInstance) => (self.visible ? 'visible' : 'hidden');
		const attach = (_parent: ObjectHostInstance | null, self: ObjectHostInstance) => {
			log.push(`attach:${identity(self)}:${self.id}:${visibility(self)}`);
			return () =>
				log.push(
					`attach-cleanup:${identity(self)}:${container.children[0] === self ? 'current' : 'stale'}:${visibility(self)}`,
				);
		};
		const ref = (self: ObjectHostInstance | null) => {
			if (self === null) {
				log.push(`ref:null:${currentRef === accepted ? 'accepted' : 'replacement'}`);
				currentRef = null;
				return;
			}
			currentRef = self;
			log.push(`ref:${identity(self)}:${self.id}:${visibility(self)}`);
		};
		const onUpdate = (self: ObjectHostInstance) =>
			log.push(`update:${identity(self)}:${self.id}:${visibility(self)}`);
		const onPress = () => log.push('press');
		const Child = defineUniversalComponent('object', (props: { args: readonly number[] }) => {
			useLayoutEffect(
				() => {
					log.push('layout:mount');
					return () => log.push('layout:cleanup');
				},
				[],
				'layout',
			);
			return universalValue(hostPlan, [
				universalProps([
					['set', 'args', props.args],
					['set', 'attach', attach],
					['set', 'onPress', onPress],
					['set', 'onUpdate', onUpdate],
					['set', 'ref', ref],
				]),
			]);
		});
		const Scene = defineUniversalComponent(
			'object',
			(props: { mode: 'visible' | 'hidden'; args: readonly number[] }) =>
				universalActivity(props.mode, () =>
					universalComponent('object', Child, { args: props.args }),
				),
		);
		const acceptedArgs = [1] as const;
		const replacementArgs = [2] as const;

		root.render(Scene, { mode: 'visible', args: acceptedArgs });
		accepted = container.children[0];
		const acceptedId = accepted.id;
		expect(currentRef).toBe(accepted);
		log.length = 0;

		failHiddenRecreate = true;
		expect(() => root.render(Scene, { mode: 'hidden', args: replacementArgs })).toThrow(
			'accepted hidden apply fault',
		);
		const replacement = container.children[0];
		expect(replacement).not.toBe(accepted);
		expect(replacement.id).toBe(acceptedId);
		expect(replacement.visible).toBe(false);
		expect(currentRef).toBe(replacement);
		expect(log).toEqual([
			`attach-cleanup:accepted:current:visible`,
			`attach:replacement:${acceptedId}:hidden`,
			'layout:cleanup',
			'ref:null:accepted',
			`update:replacement:${acceptedId}:hidden`,
			`ref:replacement:${acceptedId}:hidden`,
		]);
		expect(() => container.dispatchEvent(replacement, 'press', undefined)).toThrow(
			/no "press" listener/,
		);

		log.length = 0;
		root.render(Scene, { mode: 'visible', args: replacementArgs });
		expect(container.children[0]).toBe(replacement);
		expect(replacement.visible).toBe(true);
		expect(currentRef).toBe(replacement);
		expect(log).toEqual(['layout:mount']);
		container.dispatchEvent(replacement, 'press', undefined);
		expect(log.at(-1)).toBe('press');

		root.unmount();
		expect(log).toContain('attach-cleanup:replacement:current:visible');
		expect(log).toContain('ref:null:replacement');
	});
});
