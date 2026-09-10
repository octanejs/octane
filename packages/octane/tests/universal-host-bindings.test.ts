import { describe, expect, it } from 'vitest';
import { createScope } from 'octane/signals';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	memo,
	universalActivity,
	universalComponent,
	universalFor,
	universalHostBinding,
	universalPlan,
	universalProps,
	universalValue,
	useState,
} from '../src/universal-native.js';

function createSource<T>(initial: T) {
	let value = initial;
	let subscriptionCount = 0;
	let unsubscriptionCount = 0;
	const listeners = new Set<() => void>();
	return {
		get() {
			return value;
		},
		subscribe(notify: () => void) {
			subscriptionCount++;
			listeners.add(notify);
			return () => {
				unsubscriptionCount++;
				listeners.delete(notify);
			};
		},
		set(next: T) {
			value = next;
			for (const notify of [...listeners]) notify();
		},
		get listenerCount() {
			return listeners.size;
		},
		get subscriptionCount() {
			return subscriptionCount;
		},
		get unsubscriptionCount() {
			return unsubscriptionCount;
		},
		captureListener() {
			return [...listeners][0];
		},
	};
}

const rowPlan = universalPlan('object', {
	kind: 'host',
	type: 'row',
	bindings: [
		['active', 0],
		['label', 1],
	],
});

describe('universal host bindings', () => {
	it('binds a scoped signal to native row properties', () => {
		const scope = createScope({ scopeKey: 'native-host-binding' });
		const selected$ = scope.signal$('selected', 0);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Rows = defineUniversalComponent('object', () =>
			[0, 1].map((id) =>
				universalValue(
					rowPlan,
					[universalHostBinding(selected$, (selected) => selected === id), `row:${id}`],
					id,
				),
			),
		);

		try {
			root.render(Rows, undefined);
			expect(container.children.map((row) => row.props.active)).toEqual([true, false]);
			flushUniversalSync(() => selected$.set(1));
			expect(container.children.map((row) => row.props.active)).toEqual([false, true]);
		} finally {
			root.unmount();
			scope.dispose();
		}
	});

	it('changes both selected rows in one accepted host update', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const accepted: Array<[unknown, unknown]> = [];
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
						if (target.children.length === 2) {
							accepted.push([target.children[0].props.active, target.children[1].props.active]);
						}
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const Rows = defineUniversalComponent('object', () => [
			universalValue(rowPlan, [universalHostBinding(source, (active) => active === 0), 'first']),
			universalValue(rowPlan, [universalHostBinding(source, (active) => active === 1), 'second']),
		]);

		root.render(Rows, undefined);
		const [first, second] = container.children;
		try {
			expect(accepted).toEqual([[true, false]]);
			flushUniversalSync(() => source.set(1));
			expect(accepted).toEqual([
				[true, false],
				[false, true],
			]);
			expect(container.children).toEqual([first, second]);
			expect([first.props.label, second.props.label]).toEqual(['first', 'second']);
		} finally {
			root.unmount();
		}
		expect(source.listenerCount).toBe(0);
	});

	it('keeps the accepted source connected across an aborted replacement', () => {
		const first = createSource(1);
		const second = createSource(10);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent(
			'object',
			(props: { source: ReturnType<typeof createSource<number>>; label: string }) =>
				universalValue(rowPlan, [
					universalHostBinding(props.source, (value) => value),
					props.label,
				]),
		);

		root.render(Scene, { source: first, label: 'accepted' });
		const row = container.children[0];
		expect([first.subscriptionCount, first.unsubscriptionCount]).toEqual([1, 0]);
		try {
			const abandoned = root.prepare(Scene, { source: second, label: 'abandoned' });
			expect(abandoned.status).toBe('prepared');
			expect(row.props).toMatchObject({ active: 1, label: 'accepted' });
			abandoned.abort();
			expect(second.listenerCount).toBe(0);
			expect([first.subscriptionCount, first.unsubscriptionCount]).toEqual([1, 0]);
			expect([second.subscriptionCount, second.unsubscriptionCount]).toEqual([0, 0]);
			flushUniversalSync(() => first.set(2));
			expect(row.props).toMatchObject({ active: 2, label: 'accepted' });

			root.render(Scene, { source: second, label: 'next' });
			expect(container.children[0]).toBe(row);
			expect(row.props).toMatchObject({ active: 10, label: 'next' });
			expect(first.listenerCount).toBe(0);
			expect([first.subscriptionCount, first.unsubscriptionCount]).toEqual([1, 1]);
			expect([second.subscriptionCount, second.unsubscriptionCount]).toEqual([1, 0]);
			flushUniversalSync(() => first.set(3));
			expect(row.props.active).toBe(10);
			flushUniversalSync(() => second.set(11));
			expect(row.props.active).toBe(11);
		} finally {
			root.unmount();
		}
		expect(second.listenerCount).toBe(0);
		expect([second.subscriptionCount, second.unsubscriptionCount]).toEqual([1, 1]);
	});

	it('defers a source notification while a host transaction is prepared', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', (props: { label: string }) =>
			universalValue(rowPlan, [universalHostBinding(source, (value) => value), props.label]),
		);

		root.render(Scene, { label: 'old' });
		const row = container.children[0];
		try {
			const pending = root.prepare(Scene, { label: 'new' });
			expect(pending.status).toBe('prepared');
			expect(() => flushUniversalSync(() => source.set(1))).not.toThrow();
			expect(row.props).toMatchObject({ active: 0, label: 'old' });
			pending.commit();
			flushUniversalSync(() => {});
			expect(container.children[0]).toBe(row);
			expect(row.props).toMatchObject({ active: 1, label: 'new' });
		} finally {
			root.unmount();
		}
		expect(source.listenerCount).toBe(0);
	});

	it('replays a deferred source notification after aborting a host transaction', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', (props: { label: string }) =>
			universalValue(rowPlan, [universalHostBinding(source, (value) => value), props.label]),
		);

		root.render(Scene, { label: 'old' });
		const row = container.children[0];
		try {
			const pending = root.prepare(Scene, { label: 'discarded' });
			expect(pending.status).toBe('prepared');
			flushUniversalSync(() => source.set(1));
			expect(row.props).toMatchObject({ active: 0, label: 'old' });
			pending.abort();
			flushUniversalSync(() => {});
			expect(container.children[0]).toBe(row);
			expect(row.props).toMatchObject({ active: 1, label: 'old' });
		} finally {
			root.unmount();
		}
		expect(source.listenerCount).toBe(0);
	});

	it('applies two source changes to one host in the same accepted event update', () => {
		const active = createSource(false);
		const label = createSource('before');
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const accepted: Array<[unknown, unknown]> = [];
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
						if (target.children.length !== 0) {
							accepted.push([target.children[0].props.active, target.children[0].props.label]);
						}
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const buttonPlan = universalPlan('object', { kind: 'host', type: 'button', propsSlot: 0 });
		const Scene = defineUniversalComponent('object', () => [
			universalValue(rowPlan, [
				universalHostBinding(active, (value) => value),
				universalHostBinding(label, (value) => value),
			]),
			universalValue(buttonPlan, [
				universalProps([
					[
						'set',
						'onSelect',
						() => {
							active.set(true);
							label.set('after');
						},
					],
				]),
			]),
		]);

		root.render(Scene, undefined);
		const row = container.children[0];
		try {
			expect(accepted).toEqual([[false, 'before']]);
			flushUniversalSync(() => container.dispatchEvent(container.children[1], 'select', undefined));
			expect(accepted).toEqual([
				[false, 'before'],
				[true, 'after'],
			]);
			expect(container.children[0]).toBe(row);
			expect([active.subscriptionCount, label.subscriptionCount]).toEqual([1, 1]);
		} finally {
			root.unmount();
		}
		expect([active.unsubscriptionCount, label.unsubscriptionCount]).toEqual([1, 1]);
	});

	it('connects a bound host property inside an ownerless list', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, compilerLeafProps: true },
		});
		const Rows = defineUniversalComponent('object', () =>
			universalFor(
				[0, 1],
				(id) => id,
				(id) =>
					universalValue(rowPlan, [
						universalHostBinding(source, (active) => active === id),
						`row:${id}`,
					]),
				null,
				true,
			),
		);

		root.render(Rows, undefined);
		const [first, second] = container.children;
		try {
			expect([first.props.active, second.props.active]).toEqual([true, false]);
			flushUniversalSync(() => source.set(1));
			expect([first.props.active, second.props.active]).toEqual([false, true]);
			expect(source.listenerCount).toBe(1);
		} finally {
			root.unmount();
		}
		expect(source.listenerCount).toBe(0);
	});

	it('reconnects a hidden bound host with the latest source value on reveal', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', (props: { mode: 'visible' | 'hidden' }) =>
			universalActivity(props.mode, () =>
				universalValue(rowPlan, [universalHostBinding(source, (value) => value), 'bound']),
			),
		);

		root.render(Scene, { mode: 'visible' });
		const row = container.children[0];
		try {
			expect(row.props.active).toBe(0);
			expect(source.listenerCount).toBe(1);
			const abandoned = root.prepare(Scene, { mode: 'hidden' });
			abandoned.abort();
			expect(row.visible).toBe(true);
			expect(source.listenerCount).toBe(1);

			root.render(Scene, { mode: 'hidden' });
			expect(row.visible).toBe(false);
			expect(source.listenerCount).toBe(0);
			expect([source.subscriptionCount, source.unsubscriptionCount]).toEqual([1, 1]);
			flushUniversalSync(() => source.set(2));
			expect(row.props.active).toBe(0);

			root.render(Scene, { mode: 'visible' });
			expect(container.children[0]).toBe(row);
			expect(row.visible).toBe(true);
			expect(row.props.active).toBe(2);
			expect([source.subscriptionCount, source.unsubscriptionCount]).toEqual([2, 1]);
			flushUniversalSync(() => source.set(3));
			expect(row.props.active).toBe(3);
		} finally {
			root.unmount();
		}
		expect([source.listenerCount, source.unsubscriptionCount]).toEqual([0, 2]);
	});

	it('rejects a bound ref before accepting a host or subscribing', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('object', () =>
			universalValue(plan, [
				universalProps([['set', 'ref', universalHostBinding(source, (value) => value)]]),
			]),
		);

		expect(() => root.render(Scene, undefined)).toThrow(/ordinary host property/i);
		expect(container.commits).toHaveLength(0);
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(source.listenerCount).toBe(0);
		root.unmount();
	});

	it('rejects unsupported compact leaf bindings before accepting a host', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const root = createUniversalRoot(container, {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, compilerLeafProps: true },
		});
		const leafPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['active', 0]],
		});
		const Rows = defineUniversalComponent('object', () =>
			universalFor(
				[0],
				(id) => id,
				// The compiler's specialized leaf path passes its raw value slots.
				(id) =>
					[universalHostBinding(source, (active) => active === id)] as unknown as ReturnType<
						typeof universalValue
					>,
				null,
				true,
				true,
				undefined,
				leafPlan,
			),
		);

		expect(() => root.render(Rows, undefined)).toThrow(/compact.*binding|binding.*compact/i);
		expect(container.children).toEqual([]);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		expect(source.listenerCount).toBe(0);
		root.unmount();
	});

	it('reads the latest source in an explicit render and disconnects on unmount', () => {
		const source = createSource(1);
		const container = createObjectContainer();
		const pending: Array<() => void> = [];
		const root = createUniversalRoot(container, createObjectDriver(), {
			scheduleMicrotask: (callback) => pending.push(callback),
		});
		const Scene = defineUniversalComponent('object', (props: { label: string }) =>
			universalValue(rowPlan, [universalHostBinding(source, (value) => value), props.label]),
		);

		root.render(Scene, { label: 'before' });
		const row = container.children[0];
		const retiredListener = source.captureListener();
		source.set(2);
		root.render(Scene, { label: 'after' });
		expect(row.props).toMatchObject({ active: 2, label: 'after' });
		for (const callback of pending.splice(0)) callback();
		expect(row.props).toMatchObject({ active: 2, label: 'after' });

		root.unmount();
		expect(container.children).toEqual([]);
		expect(source.listenerCount).toBe(0);
		const accepted = container.commits.length;
		flushUniversalSync(() => {
			source.set(3);
			retiredListener?.();
		});
		for (const callback of pending.splice(0)) callback();
		expect(container.children).toEqual([]);
		expect(container.commits).toHaveLength(accepted);
	});

	it('allows a surviving row to update after a queued row was removed', () => {
		const first = createSource(0);
		const second = createSource(0);
		const container = createObjectContainer();
		const pending: Array<() => void> = [];
		const root = createUniversalRoot(container, createObjectDriver(), {
			scheduleMicrotask: (callback) => pending.push(callback),
		});
		const Scene = defineUniversalComponent('object', (props: { showFirst: boolean }) => [
			props.showFirst
				? universalValue(rowPlan, [universalHostBinding(first, (value) => value), 'first'], 'first')
				: null,
			universalValue(rowPlan, [universalHostBinding(second, (value) => value), 'second'], 'second'),
		]);
		const drain = () => {
			for (let index = 0; index < 20 && pending.length !== 0; index++) pending.shift()!();
			expect(pending).toEqual([]);
		};

		root.render(Scene, { showFirst: true });
		const surviving = container.children[1];
		first.set(1);
		root.render(Scene, { showFirst: false });
		expect(container.children).toEqual([surviving]);
		expect(first.listenerCount).toBe(0);
		drain();

		second.set(2);
		drain();
		expect(surviving.props).toMatchObject({ active: 2, label: 'second' });
		root.unmount();
		expect(second.listenerCount).toBe(0);
	});

	it('keeps bound properties responsive after a scheduled component render fails', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const pending: Array<() => void> = [];
		const errors: unknown[] = [];
		const root = createUniversalRoot(container, createObjectDriver(), {
			scheduleMicrotask: (callback) => pending.push(callback),
			onUncaughtError: (error) => errors.push(error),
		});
		let fail!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [broken, setBroken] = useState(false, 'broken');
			fail = () => setBroken(true);
			if (broken) throw new Error('component render failed');
			return universalValue(rowPlan, [universalHostBinding(source, (value) => value), 'accepted']);
		});
		const drain = () => {
			for (let index = 0; index < 20 && pending.length !== 0; index++) pending.shift()!();
			expect(pending).toEqual([]);
		};

		root.render(Scene, undefined);
		const row = container.children[0];
		try {
			source.set(1);
			fail();
			drain();
			expect(errors).toHaveLength(1);
			expect(errors[0]).toMatchObject({ message: 'component render failed' });
			expect(row.props).toMatchObject({ active: 1, label: 'accepted' });
			source.set(2);
			drain();
			expect(row.props.active).toBe(2);
		} finally {
			root.unmount();
		}
		expect(source.listenerCount).toBe(0);
	});

	it('publishes a bound value and ordinary state change together for one event', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const buttonPlan = universalPlan('object', {
			kind: 'host',
			type: 'button',
			propsSlot: 0,
		});
		const Scene = defineUniversalComponent('object', () => {
			const [changed, setChanged] = useState(false, 'changed');
			return [
				universalValue(rowPlan, [
					universalHostBinding(source, (value) => value),
					changed ? 'after' : 'before',
				]),
				universalValue(buttonPlan, [
					universalProps([
						[
							'set',
							'onSelect',
							() => {
								source.set(1);
								setChanged(true);
							},
						],
					]),
				]),
			];
		});

		root.render(Scene, undefined);
		const row = container.children[0];
		const before = container.commits.length;
		flushUniversalSync(() => container.dispatchEvent(container.children[1], 'select', undefined));
		expect(row.props).toMatchObject({ active: 1, label: 'after' });
		expect(container.commits).toHaveLength(before + 1);
		root.unmount();
	});

	it('keeps earlier accepted hosts responsive if a later new source fails', () => {
		const first = createSource(1);
		const second = {
			get() {
				return 2;
			},
			subscribe(_notify: () => void): () => void {
				throw new Error('source subscription failed');
			},
		};
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', () => [
			universalValue(rowPlan, [universalHostBinding(first, (value) => value), 'first']),
			universalValue(rowPlan, [universalHostBinding(second, (value) => value), 'second']),
		]);

		expect(() => root.render(Scene, undefined)).toThrow('source subscription failed');
		expect(container.children).toHaveLength(2);
		expect(first.listenerCount).toBe(1);
		flushUniversalSync(() => first.set(3));
		expect(container.children[0].props.active).toBe(3);
		root.unmount();
		expect(first.listenerCount).toBe(0);
	});

	it('keeps a previously mounted bound host connected if another source fails', () => {
		const healthy = createSource(0);
		const stableBinding = universalHostBinding(healthy, (value) => value);
		const failing = {
			get: () => 0,
			subscribe(_notify: () => void): () => void {
				throw new Error('new source subscription failed');
			},
		};
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', (props: { add: boolean }) => [
			universalValue(rowPlan, [stableBinding, 'existing'], 'existing'),
			props.add
				? universalValue(rowPlan, [universalHostBinding(failing, (value) => value), 'new'], 'new')
				: null,
		]);

		root.render(Scene, { add: false });
		const existing = container.children[0];
		expect(healthy.listenerCount).toBe(1);
		try {
			expect(() => root.render(Scene, { add: true })).toThrow('new source subscription failed');
			expect(container.children).toHaveLength(2);
			expect(container.children[0]).toBe(existing);
			expect(healthy.listenerCount).toBe(1);
			flushUniversalSync(() => healthy.set(1));
			expect(existing.props.active).toBe(1);
		} finally {
			root.unmount();
		}
		expect(healthy.listenerCount).toBe(0);
	});

	it('disconnects after a source read fails following subscription', () => {
		let subscribed = false;
		const listeners = new Set<() => void>();
		const source = {
			get() {
				if (subscribed) throw new Error('source read failed');
				return 1;
			},
			subscribe(notify: () => void) {
				listeners.add(notify);
				subscribed = true;
				return () => listeners.delete(notify);
			},
		};
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', () =>
			universalValue(rowPlan, [universalHostBinding(source, (value) => value), 'first']),
		);

		expect(() => root.render(Scene, undefined)).toThrow('source read failed');
		expect(listeners.size).toBe(0);
		root.unmount();
	});

	it('disconnects every removed host when one source cleanup throws', () => {
		const fault = new Error('first source cleanup failed');
		const firstListeners = new Set<() => void>();
		let staleListener: () => void = () => {};
		let firstCleanups = 0;
		const first = {
			get: () => 0,
			subscribe(notify: () => void) {
				firstListeners.add(notify);
				staleListener = notify;
				return () => {
					firstListeners.delete(notify);
					firstCleanups++;
					notify();
					throw fault;
				};
			},
		};
		const second = createSource(1);
		const third = createSource(2);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Rows = defineUniversalComponent('object', () => [
			universalValue(rowPlan, [universalHostBinding(first, (value) => value), 'first'], 'first'),
			universalValue(rowPlan, [universalHostBinding(second, (value) => value), 'second'], 'second'),
			universalValue(rowPlan, [universalHostBinding(third, (value) => value), 'third'], 'third'),
		]);

		root.render(Rows, undefined);
		expect(() => root.unmount()).toThrow(fault);
		expect(container.children).toEqual([]);
		expect(container.instanceCount).toBe(0);
		expect(firstListeners.size).toBe(0);
		expect(firstCleanups).toBe(1);
		expect([second.listenerCount, third.listenerCount]).toEqual([0, 0]);
		expect([second.unsubscriptionCount, third.unsubscriptionCount]).toEqual([1, 1]);
		const accepted = container.commits.length;
		flushUniversalSync(() => {
			staleListener();
			second.set(3);
			third.set(4);
		});
		expect(container.commits).toHaveLength(accepted);
		root.unmount();
		expect(firstCleanups).toBe(1);
	});

	it('publishes a queued binding after an accepted scheduled host commit fails', () => {
		const source = createSource(0);
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const fault = new Error('host apply failed after acceptance');
		let failOnce = true;
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				if (
					!batch.commands.some(
						(command) => command.op === 'update' && command.props.value === 'after',
					)
				) {
					return prepared;
				}
				return {
					...prepared,
					apply() {
						prepared.apply();
						if (failOnce) {
							failOnce = false;
							throw fault;
						}
					},
				};
			},
		};
		const pending: Array<() => void> = [];
		const thrown: unknown[] = [];
		const root = createUniversalRoot(container, driver, {
			scheduleMicrotask: (callback) => pending.push(callback),
		});
		const stagePlan = universalPlan('object', {
			kind: 'host',
			type: 'stage',
			bindings: [['value', 0]],
		});
		const Bound = memo(
			defineUniversalComponent('object', () =>
				universalValue(rowPlan, [universalHostBinding(source, (value) => value), 'bound']),
			),
		);
		let updateStage!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [stage, setStage] = useState('before', 'stage');
			updateStage = () => setStage('after');
			return [universalComponent('object', Bound), universalValue(stagePlan, [stage])];
		});
		const drain = () => {
			for (let index = 0; index < 20 && pending.length !== 0; index++) {
				try {
					pending.shift()!();
				} catch (error) {
					thrown.push(error);
				}
			}
			expect(pending).toEqual([]);
		};

		root.render(Scene, undefined);
		const row = container.children[0];
		try {
			source.set(1);
			updateStage();
			drain();
			expect(thrown).toEqual([fault]);
			expect(container.children[0]).toBe(row);
			expect(container.children[1].props.value).toBe('after');
			expect(row.props.active).toBe(1);
			source.set(2);
			drain();
			expect(row.props.active).toBe(2);
		} finally {
			root.unmount();
		}
		expect(source.listenerCount).toBe(0);
	});

	it('reports both an accepted host failure and a queued source read failure', () => {
		const backing = createSource(0);
		const hostError = new Error('accepted host apply failed');
		const sourceError = new Error('bound source read failed');
		let failNextRead = false;
		const source = {
			get() {
				if (failNextRead) {
					failNextRead = false;
					throw sourceError;
				}
				return backing.get();
			},
			subscribe(notify: () => void) {
				return backing.subscribe(notify);
			},
		};
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const driver = {
			...baseDriver,
			prepareBatch(
				target: typeof container,
				batch: (typeof container.commits)[number],
				context: Parameters<typeof baseDriver.prepareBatch>[2],
			) {
				const prepared = baseDriver.prepareBatch(target, batch, context);
				if (
					!batch.commands.some(
						(command) => command.op === 'update' && command.props.value === 'after',
					)
				) {
					return prepared;
				}
				return {
					...prepared,
					apply() {
						prepared.apply();
						failNextRead = true;
						backing.set(1);
						throw hostError;
					},
				};
			},
		};
		const root = createUniversalRoot(container, driver);
		const stagePlan = universalPlan('object', {
			kind: 'host',
			type: 'stage',
			bindings: [['value', 0]],
		});
		const bound = universalHostBinding(source, (value) => value);
		const Bound = memo(
			defineUniversalComponent('object', () => universalValue(rowPlan, [bound, 'bound'])),
		);
		let updateStage!: () => void;
		const Scene = defineUniversalComponent('object', () => {
			const [stage, setStage] = useState('before', 'stage');
			updateStage = () => setStage('after');
			return [universalComponent('object', Bound), universalValue(stagePlan, [stage])];
		});

		root.render(Scene, undefined);
		const row = container.children[0];
		try {
			let reported: unknown;
			try {
				flushUniversalSync(() => updateStage());
			} catch (error) {
				reported = error;
			}
			expect(reported).toBeInstanceOf(AggregateError);
			expect((reported as AggregateError).errors).toEqual([hostError, sourceError]);
			expect(container.children[1].props.value).toBe('after');
			expect(row.props.active).toBe(0);
			flushUniversalSync(() => backing.set(2));
			expect(row.props.active).toBe(2);
		} finally {
			root.unmount();
		}
		expect(backing.listenerCount).toBe(0);
	});
});
