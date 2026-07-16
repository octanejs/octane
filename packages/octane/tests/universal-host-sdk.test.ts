import { describe, expect, it } from 'vitest';
import {
	type ObjectHostInstance,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalComponent,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	useLayoutEffect,
} from '../src/universal.js';

const hostPlan = universalPlan('object', {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
	children: [{ kind: 'host', type: 'child' }],
});

describe('universal prepared host SDK', () => {
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
