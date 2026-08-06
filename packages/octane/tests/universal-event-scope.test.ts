import { describe, expect, it } from 'vitest';
import {
	createContext,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	universalComponent,
	universalContext,
	universalFor,
	universalPlan,
	universalProps,
	universalTry,
	universalValue,
	use,
	useContext,
	useLayoutEffect,
	useState,
} from '../src/universal.js';

const eventPlan = universalPlan('object', {
	kind: 'host',
	type: 'scene',
	bindings: [['count', 2]],
	children: [
		{ kind: 'host', type: 'first', propsSlot: 0 },
		{ kind: 'host', type: 'second', propsSlot: 1 },
	],
});

describe('universal event scopes', () => {
	it('publishes scheduled direct-root work before a synchronous host boundary returns', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'scene',
			bindings: [['count', 0]],
		});
		let setCount!: (value: number) => void;
		const Scene = defineUniversalComponent('object', () => {
			const [count, updateCount] = useState(0, 'count');
			setCount = updateCount;
			return universalValue(plan, [count]);
		});

		root.render(Scene, undefined);
		expect(container.children[0].props.count).toBe(0);

		const result = flushUniversalSync(() => {
			setCount(1);
			return 'committed';
		});

		expect(result).toBe('committed');
		expect(container.children[0].props.count).toBe(1);
		root.unmount();
	});

	it('pins one accepted listener table across nested delivery and flushes discrete work once', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const log: string[] = [];
		const Scene = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(eventPlan, [
				universalProps([
					[
						'set',
						'onFire',
						() => {
							log.push(`first:${count}`);
							setCount((value) => value + 1);
						},
					],
				]),
				universalProps([['set', 'onFire', () => log.push(`second:${count}`)]]),
				count,
			]);
		});

		root.render(Scene, undefined);
		const first = container.children[0].children[0];
		const second = container.children[0].children[1];
		expect(container.commits).toHaveLength(1);

		root.eventScope('discrete', () => {
			container.dispatchEvent(first, 'fire', undefined);
			root.eventScope('discrete', () => {
				container.dispatchEvent(second, 'fire', undefined);
			});
			expect(container.commits).toHaveLength(1);
		});

		expect(log).toEqual(['first:0', 'second:0']);
		expect(container.commits).toHaveLength(2);
		expect(container.children[0].props.count).toBe(1);

		log.length = 0;
		container.dispatchEvent(first, 'fire', undefined);
		expect(log).toEqual(['first:1']);
		expect(container.commits).toHaveLength(3);
		expect(container.children[0].props.count).toBe(2);
		root.unmount();
	});

	it('updates one child without disrupting retained siblings, context, or topology fallback', () => {
		const Theme = createContext('light');
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const interactivePlan = universalPlan('object', {
			kind: 'host',
			type: 'interactive',
			propsSlot: 0,
		});
		const extraPlan = universalPlan('object', {
			kind: 'host',
			type: 'extra',
			bindings: [['value', 0]],
		});
		const log: string[] = [];
		let expand!: () => void;

		const Counter = defineUniversalComponent('object', () => {
			const theme = useContext(Theme);
			const [count, setCount] = useState(0, 'count');
			const [expanded, setExpanded] = useState(false, 'expanded');
			expand = () => setExpanded(true);
			useLayoutEffect(
				() => {
					log.push(`counter:mount:${theme}:${count}`);
					return () => log.push(`counter:cleanup:${theme}:${count}`);
				},
				[theme, count],
				'counter-effect',
			);
			return [
				universalValue(interactivePlan, [
					universalProps([
						['set', 'value', `${theme}:${count}`],
						['set', 'onPress', () => setCount((value) => value + 1)],
					]),
				]),
				expanded ? universalValue(extraPlan, ['expanded']) : null,
			];
		});
		const Sibling = defineUniversalComponent('object', () => {
			useLayoutEffect(
				() => {
					log.push('sibling:mount');
					return () => log.push('sibling:cleanup');
				},
				[],
				'sibling-effect',
			);
			return universalValue(interactivePlan, [
				universalProps([
					['set', 'value', 'sibling'],
					['set', 'onPing', () => log.push('sibling:event')],
				]),
			]);
		});
		const Parent = defineUniversalComponent('object', () =>
			universalContext(Theme, 'dark', [
				universalComponent('object', Counter),
				universalComponent('object', Sibling),
			]),
		);

		root.render(Parent, undefined);
		const counter = container.children[0];
		const sibling = container.children[1];
		expect(counter.props.value).toBe('dark:0');
		expect(log).toEqual(['counter:mount:dark:0', 'sibling:mount']);

		container.dispatchEvent(sibling, 'ping', undefined);
		flushUniversalSync(() => container.dispatchEvent(counter, 'press', undefined));
		expect(container.children[0]).toBe(counter);
		expect(container.children[1]).toBe(sibling);
		expect(counter.props.value).toBe('dark:1');
		container.dispatchEvent(sibling, 'ping', undefined);
		expect(log).toEqual([
			'counter:mount:dark:0',
			'sibling:mount',
			'sibling:event',
			'counter:cleanup:dark:0',
			'counter:mount:dark:1',
			'sibling:event',
		]);

		flushUniversalSync(expand);
		expect(container.children[0]).toBe(counter);
		expect(container.children[1].type).toBe('extra');
		expect(container.children[1].props.value).toBe('expanded');
		expect(container.children[2]).toBe(sibling);
		container.dispatchEvent(sibling, 'ping', undefined);
		expect(log.filter((entry) => entry === 'sibling:mount')).toHaveLength(1);
		expect(log.filter((entry) => entry === 'sibling:event')).toHaveLength(3);

		root.unmount();
		expect(log.filter((entry) => entry === 'counter:cleanup:dark:1')).toHaveLength(1);
		expect(log.filter((entry) => entry === 'sibling:cleanup')).toHaveLength(1);
	});

	it('keeps accepted child state intact when a scheduled host batch is rejected', () => {
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		let reject = false;
		const driver = {
			...baseDriver,
			prepareBatch(...args: Parameters<typeof baseDriver.prepareBatch>) {
				if (reject) throw new Error('host rejected child update');
				return baseDriver.prepareBatch(...args);
			},
		};
		const root = createUniversalRoot(container, driver);
		const valuePlan = universalPlan('object', {
			kind: 'host',
			type: 'value',
			bindings: [['value', 0]],
		});
		let setCount!: (value: number) => void;
		const Child = defineUniversalComponent('object', () => {
			const [count, updateCount] = useState(0, 'count');
			setCount = updateCount;
			return universalValue(valuePlan, [count]);
		});
		const Parent = defineUniversalComponent('object', () => [
			universalComponent('object', Child),
			universalValue(valuePlan, ['sibling']),
		]);

		root.render(Parent, undefined);
		const child = container.children[0];
		const sibling = container.children[1];
		reject = true;
		expect(() => flushUniversalSync(() => setCount(1))).toThrow('host rejected child update');
		expect(child.props.value).toBe(0);
		expect(container.children).toEqual([child, sibling]);
		expect(container.commits).toHaveLength(1);

		reject = false;
		flushUniversalSync(() => setCount(2));
		expect(child.props.value).toBe(2);
		expect(container.children).toEqual([child, sibling]);
		expect(container.commits).toHaveLength(2);
		root.unmount();
	});

	it('updates one keyed list item while sibling items keep identity, state, and handlers', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const rowPlan = universalPlan('object', { kind: 'host', type: 'row', propsSlot: 0 });
		const List = defineUniversalComponent('object', ({ ids }: { ids: number[] }) =>
			universalFor(
				ids,
				(id) => id,
				(id) => {
					const [count, setCount] = useState(0, 'count');
					return universalValue(rowPlan, [
						universalProps([
							['set', 'value', `${id}:${count}`],
							['set', 'onPress', () => setCount((value) => value + 1)],
						]),
					]);
				},
			),
		);
		const Shell = defineUniversalComponent('object', ({ ids }: { ids: number[] }) =>
			universalComponent('object', List, { ids }),
		);

		root.render(Shell, { ids: [1, 2, 3] });
		const rows = [...container.children];
		expect(rows.map((row) => row.props.value)).toEqual(['1:0', '2:0', '3:0']);
		expect(container.commits).toHaveLength(1);

		flushUniversalSync(() => container.dispatchEvent(rows[1], 'press', {}));
		expect(container.commits).toHaveLength(2);
		expect(container.children).toEqual(rows);
		expect(rows.map((row) => row.props.value)).toEqual(['1:0', '2:1', '3:0']);

		// Sibling handlers survive the middle row's update and keep their own state.
		flushUniversalSync(() => container.dispatchEvent(rows[0], 'press', {}));
		flushUniversalSync(() => container.dispatchEvent(rows[2], 'press', {}));
		flushUniversalSync(() => container.dispatchEvent(rows[1], 'press', {}));
		expect(container.children).toEqual(rows);
		expect(rows.map((row) => row.props.value)).toEqual(['1:1', '2:2', '3:1']);
		root.unmount();
	});

	it('applies parent and child state raised by one event in a single commit', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const rowPlan = universalPlan('object', { kind: 'host', type: 'row', propsSlot: 0 });
		const mounts: string[] = [];
		const Row = defineUniversalComponent(
			'object',
			({ id, total, onBump }: { id: string; total: number; onBump: () => void }) => {
				const [count, setCount] = useState(0, 'count');
				useLayoutEffect(() => void mounts.push(`row:${id}`), [], 'row-mount');
				return universalValue(rowPlan, [
					universalProps([
						['set', 'value', `${id}:${count}:${total}`],
						[
							'set',
							'onPress',
							() => {
								setCount((value) => value + 1);
								onBump();
							},
						],
					]),
				]);
			},
		);
		const Panel = defineUniversalComponent('object', () => {
			const [total, setTotal] = useState(0, 'total');
			const onBump = () => setTotal((value) => value + 1);
			return [
				universalComponent('object', Row, { id: 'a', total, onBump }, 'a'),
				universalComponent('object', Row, { id: 'b', total, onBump }, 'b'),
			];
		});
		const Shell = defineUniversalComponent('object', () => universalComponent('object', Panel));

		root.render(Shell, undefined);
		const [first, second] = container.children;
		expect(first.props.value).toBe('a:0:0');
		expect(second.props.value).toBe('b:0:0');
		expect(mounts).toEqual(['row:a', 'row:b']);

		flushUniversalSync(() => container.dispatchEvent(first, 'press', {}));
		expect(container.commits).toHaveLength(2);
		expect(container.children[0]).toBe(first);
		expect(container.children[1]).toBe(second);
		expect(first.props.value).toBe('a:1:1');
		expect(second.props.value).toBe('b:0:1');
		expect(mounts).toEqual(['row:a', 'row:b']);
		root.unmount();
	});

	it('replaces its own attach callback on update without re-running sibling attachments', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const hostPlan = universalPlan('object', { kind: 'host', type: 'item', propsSlot: 0 });
		const log: string[] = [];
		const Counter = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			return universalValue(hostPlan, [
				universalProps([
					['set', 'value', count],
					['set', 'onPress', () => setCount((value) => value + 1)],
					[
						'set',
						'attach',
						() => {
							log.push(`counter:attach:${count}`);
							return () => log.push(`counter:detach:${count}`);
						},
					],
				]),
			]);
		});
		const Sibling = defineUniversalComponent('object', () =>
			universalValue(hostPlan, [
				universalProps([
					['set', 'value', 'sibling'],
					[
						'set',
						'attach',
						() => {
							log.push('sibling:attach');
							return () => log.push('sibling:detach');
						},
					],
				]),
			]),
		);
		const Parent = defineUniversalComponent('object', () => [
			universalComponent('object', Counter),
			universalComponent('object', Sibling),
		]);

		root.render(Parent, undefined);
		const counter = container.children[0];
		expect(log).toEqual(['counter:attach:0', 'sibling:attach']);

		flushUniversalSync(() => container.dispatchEvent(counter, 'press', {}));
		expect(counter.props.value).toBe(1);
		expect(log).toEqual([
			'counter:attach:0',
			'sibling:attach',
			'counter:detach:0',
			'counter:attach:1',
		]);

		root.unmount();
		expect(log.filter((entry) => entry === 'counter:detach:1')).toHaveLength(1);
		expect(log.filter((entry) => entry === 'sibling:detach')).toHaveLength(1);
	});

	it('inserts, reorders, and removes scope hosts around retained out-of-scope siblings', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['label', 0]],
		});
		const headerPlan = universalPlan('object', { kind: 'host', type: 'header', propsSlot: 0 });
		const siblingPlan = universalPlan('object', {
			kind: 'host',
			type: 'sibling',
			bindings: [['value', 0]],
		});
		let apply!: (ids: string[]) => void;
		const Rows = defineUniversalComponent('object', () => {
			const [ids, setIds] = useState(['a', 'b'], 'ids');
			apply = (next) => setIds(next);
			return [
				universalValue(headerPlan, [universalProps([['set', 'value', ids.join('')]])]),
				...ids.map((id) => universalValue(rowPlan, [id], id)),
			];
		});
		const Shell = defineUniversalComponent('object', () => [
			universalComponent('object', Rows),
			universalValue(siblingPlan, ['sib']),
		]);

		root.render(Shell, undefined);
		expect(container.children.map((child) => child.type)).toEqual([
			'header',
			'row',
			'row',
			'sibling',
		]);
		const header = container.children[0];
		const rowA = container.children[1];
		const rowB = container.children[2];
		const sibling = container.children[3];

		// Reorder survivors and append a new row: everything stays anchored
		// before the untouched out-of-scope sibling.
		flushUniversalSync(() => apply(['b', 'a', 'c']));
		expect(container.children[0]).toBe(header);
		expect(header.props.value).toBe('bac');
		expect(container.children[1]).toBe(rowB);
		expect(container.children[2]).toBe(rowA);
		expect(container.children[3].type).toBe('row');
		expect(container.children[3].props.label).toBe('c');
		const rowC = container.children[3];
		expect(container.children[4]).toBe(sibling);

		flushUniversalSync(() => apply(['c']));
		expect(container.children.map((child) => child.type)).toEqual(['header', 'row', 'sibling']);
		expect(container.children[1]).toBe(rowC);
		expect(container.children[2]).toBe(sibling);
		root.unmount();
	});

	it('anchors structural scope changes before later siblings inside a host parent', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const framePlan = universalPlan('object', {
			kind: 'host',
			type: 'frame',
			children: [
				{ kind: 'slot', slot: 0 },
				{ kind: 'host', type: 'footer', bindings: [['value', 1]] },
			],
		});
		const pressPlan = universalPlan('object', { kind: 'host', type: 'presser', propsSlot: 0 });
		const extraPlan = universalPlan('object', {
			kind: 'host',
			type: 'extra',
			bindings: [['value', 0]],
		});
		const Toggler = defineUniversalComponent('object', () => {
			const [expanded, setExpanded] = useState(false, 'expanded');
			return [
				universalValue(pressPlan, [
					universalProps([
						['set', 'value', expanded],
						['set', 'onPress', () => setExpanded((value) => !value)],
					]),
				]),
				expanded ? universalValue(extraPlan, ['x']) : null,
			];
		});
		const Shell = defineUniversalComponent('object', () =>
			universalValue(framePlan, [universalComponent('object', Toggler), 'foot']),
		);

		root.render(Shell, undefined);
		const frame = container.children[0];
		const presser = frame.children[0];
		const footer = frame.children[1];
		expect(frame.children.map((child) => child.type)).toEqual(['presser', 'footer']);

		// The inserted host must land between the presser and the footer, which is
		// an out-of-scope sibling inside the same host parent.
		flushUniversalSync(() => container.dispatchEvent(presser, 'press', {}));
		expect(frame.children.map((child) => child.type)).toEqual(['presser', 'extra', 'footer']);
		expect(frame.children[0]).toBe(presser);
		expect(frame.children[2]).toBe(footer);

		flushUniversalSync(() => container.dispatchEvent(presser, 'press', {}));
		expect(frame.children.map((child) => child.type)).toEqual(['presser', 'footer']);
		expect(frame.children[1]).toBe(footer);
		root.unmount();
	});

	it('updates compact leaf rows from list state without disturbing row identity', () => {
		const container = createObjectContainer();
		const base = createObjectDriver();
		const driver = { ...base, capabilities: { ...base.capabilities, compilerLeafProps: true } };
		const root = createUniversalRoot(container, driver);
		const rowPlan = universalPlan('object', {
			kind: 'host',
			type: 'row',
			bindings: [['label', 0]],
		});
		const headerPlan = universalPlan('object', { kind: 'host', type: 'header', propsSlot: 0 });
		const siblingPlan = universalPlan('object', {
			kind: 'host',
			type: 'sibling',
			bindings: [['value', 0]],
		});
		const List = defineUniversalComponent('object', ({ ids }: { ids: number[] }) => {
			const [selected, setSelected] = useState(0, 'selected');
			return [
				universalValue(headerPlan, [
					universalProps([
						['set', 'value', selected],
						['set', 'onPress', () => setSelected((value) => value + 1)],
					]),
				]),
				universalFor(
					ids,
					(id) => id,
					(id) => universalValue(rowPlan, [id === selected ? `${id}*` : `${id}`]),
					null,
					true,
					true,
				),
			];
		});
		const Shell = defineUniversalComponent('object', ({ ids }: { ids: number[] }) => [
			universalComponent('object', List, { ids }),
			universalValue(siblingPlan, ['sib']),
		]);

		root.render(Shell, { ids: [0, 1, 2] });
		const header = container.children[0];
		const rows = container.children.slice(1, 4);
		const sibling = container.children[4];
		expect(rows.map((row) => row.props.label)).toEqual(['0*', '1', '2']);

		flushUniversalSync(() => container.dispatchEvent(header, 'press', {}));
		expect(container.children[0]).toBe(header);
		expect(header.props.value).toBe(1);
		expect(container.children.slice(1, 4)).toEqual(rows);
		expect(rows.map((row) => row.props.label)).toEqual(['0', '1*', '2']);
		expect(container.children[4]).toBe(sibling);

		flushUniversalSync(() => container.dispatchEvent(header, 'press', {}));
		expect(container.children.slice(1, 4)).toEqual(rows);
		expect(rows.map((row) => row.props.label)).toEqual(['0', '1', '2*']);
		root.unmount();
	});

	it('routes a scoped update render error to an enclosing idle try boundary', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const counterPlan = universalPlan('object', { kind: 'host', type: 'counter', propsSlot: 0 });
		const caughtPlan = universalPlan('object', {
			kind: 'host',
			type: 'caught',
			bindings: [['message', 0]],
		});
		const siblingPlan = universalPlan('object', {
			kind: 'host',
			type: 'sibling',
			bindings: [['value', 0]],
		});
		const Counter = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			if (count === 2) throw new Error('counter exploded');
			return universalValue(counterPlan, [
				universalProps([
					['set', 'value', count],
					['set', 'onPress', () => setCount((value) => value + 1)],
				]),
			]);
		});
		const Shell = defineUniversalComponent('object', () => [
			universalTry(
				() => universalComponent('object', Counter),
				null,
				(error) => universalValue(caughtPlan, [(error as Error).message]),
			),
			universalValue(siblingPlan, ['sib']),
		]);

		root.render(Shell, undefined);
		const counter = container.children[0];
		const sibling = container.children[1];
		expect(counter.props.value).toBe(0);

		flushUniversalSync(() => container.dispatchEvent(counter, 'press', {}));
		expect(container.children[0]).toBe(counter);
		expect(counter.props.value).toBe(1);
		expect(container.children[1]).toBe(sibling);

		flushUniversalSync(() => container.dispatchEvent(counter, 'press', {}));
		expect(container.children[0].type).toBe('caught');
		expect(container.children[0].props.message).toBe('counter exploded');
		expect(container.children[1]).toBe(sibling);
		root.unmount();
	});

	it('applies updates around an active suspense episode and reveals queued hidden state', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const bodyPlan = universalPlan('object', { kind: 'host', type: 'primary', propsSlot: 0 });
		const fallbackPlan = universalPlan('object', { kind: 'host', type: 'fallback', propsSlot: 0 });
		const siblingPlan = universalPlan('object', {
			kind: 'host',
			type: 'sibling',
			bindings: [['value', 0]],
		});
		let pending: Promise<string> | null = null;
		let resolvePending!: (value: string) => void;
		let bumpHidden!: () => void;
		const Panel = defineUniversalComponent('object', () => [
			universalTry(
				() => {
					const [n, setN] = useState(0, 'n');
					bumpHidden = () => setN((value) => value + 1);
					const value = pending === null ? 'ready' : use(pending);
					return universalValue(bodyPlan, [universalProps([['set', 'value', `${value}:${n}`]])]);
				},
				() => {
					const [ticks, setTicks] = useState(0, 'ticks');
					return universalValue(fallbackPlan, [
						universalProps([
							['set', 'value', `pending:${ticks}`],
							['set', 'onPress', () => setTicks((value) => value + 1)],
						]),
					]);
				},
			),
			universalValue(siblingPlan, ['sib']),
		]);
		const Shell = defineUniversalComponent('object', () => universalComponent('object', Panel));

		root.render(Shell, undefined);
		const body = container.children[0];
		const sibling = container.children[1];
		expect(body.props.value).toBe('ready:0');

		// Idle boundary between the stateful try body and its component: the
		// update still lands and the sibling keeps identity.
		flushUniversalSync(bumpHidden);
		expect(container.children[0]).toBe(body);
		expect(body.props.value).toBe('ready:1');

		pending = new Promise<string>((resolve) => {
			resolvePending = resolve;
		});
		flushUniversalSync(bumpHidden);
		const fallback = container.children.find((child) => child.type === 'fallback')!;
		expect(fallback).toBeDefined();
		expect(fallback.props.value).toBe('pending:0');
		expect(body.visible).toBe(false);
		expect(container.children.includes(sibling)).toBe(true);

		// The episode is active: another hidden-body update must not disturb the
		// retained arm and stays queued for the reveal.
		flushUniversalSync(bumpHidden);
		expect(container.children.find((child) => child.type === 'fallback')).toBe(fallback);
		expect(body.visible).toBe(false);

		// Pending-arm state keeps working while the episode is active.
		flushUniversalSync(() => container.dispatchEvent(fallback, 'press', {}));
		expect(fallback.props.value).toBe('pending:1');

		resolvePending('done');
		for (let index = 0; index < 6; index++) await Promise.resolve();
		const revealed = container.children.find((child) => child.type === 'primary')!;
		expect(revealed.visible).toBe(true);
		expect(revealed.props.value).toBe('done:3');
		expect(container.children.includes(sibling)).toBe(true);
		root.unmount();
	});

	it('scopes a root-component state update and keeps untouched siblings live', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const pressPlan = universalPlan('object', { kind: 'host', type: 'presser', propsSlot: 0 });
		const extraPlan = universalPlan('object', {
			kind: 'host',
			type: 'extra',
			bindings: [['value', 0]],
		});
		const log: string[] = [];
		const Leaf = defineUniversalComponent('object', ({ id }: { id: string }) => {
			const [count, setCount] = useState(0, 'count');
			useLayoutEffect(
				() => {
					log.push(`leaf:${id}:mount`);
					return () => log.push(`leaf:${id}:cleanup`);
				},
				[],
				'leaf-effect',
			);
			return universalValue(pressPlan, [
				universalProps([
					['set', 'value', `${id}:${count}`],
					['set', 'onPress', () => setCount((value) => value + 1)],
				]),
			]);
		});
		// State lives in the root component itself: the update has no smaller
		// enclosing component, so the root range is the replay scope.
		const App = defineUniversalComponent('object', () => {
			const [count, setCount] = useState(0, 'count');
			return [
				universalValue(pressPlan, [
					universalProps([
						['set', 'value', `root:${count}`],
						['set', 'onPress', () => setCount((value) => value + 1)],
					]),
				]),
				count % 2 === 1 ? universalValue(extraPlan, ['expanded']) : null,
				universalComponent('object', Leaf, { id: 'a' }, 'a'),
				universalComponent('object', Leaf, { id: 'b' }, 'b'),
			];
		});

		root.render(App, undefined);
		const rootHost = container.children[0];
		const leafA = container.children[1];
		const leafB = container.children[2];
		expect(rootHost.props.value).toBe('root:0');
		expect(log).toEqual(['leaf:a:mount', 'leaf:b:mount']);

		// A root-state structural update (the extra host appears and disappears)
		// commits around the retained leaves without disturbing their identity.
		flushUniversalSync(() => container.dispatchEvent(rootHost, 'press', {}));
		expect(container.children.map((child) => child.type)).toEqual([
			'presser',
			'extra',
			'presser',
			'presser',
		]);
		expect(container.children[0]).toBe(rootHost);
		expect(rootHost.props.value).toBe('root:1');
		expect(container.children[2]).toBe(leafA);
		expect(container.children[3]).toBe(leafB);

		flushUniversalSync(() => container.dispatchEvent(rootHost, 'press', {}));
		expect(rootHost.props.value).toBe('root:2');
		expect(container.children).toEqual([rootHost, leafA, leafB]);

		// Leaves kept their own state, handlers, and effects across the root
		// replays they did not participate in, and their updates still land.
		flushUniversalSync(() => container.dispatchEvent(leafB, 'press', {}));
		expect(leafB.props.value).toBe('b:1');
		expect(leafA.props.value).toBe('a:0');
		flushUniversalSync(() => container.dispatchEvent(rootHost, 'press', {}));
		flushUniversalSync(() => container.dispatchEvent(leafB, 'press', {}));
		expect(leafB.props.value).toBe('b:2');
		expect(rootHost.props.value).toBe('root:3');
		expect(log).toEqual(['leaf:a:mount', 'leaf:b:mount']);

		root.unmount();
		expect(log.filter((entry) => entry === 'leaf:a:cleanup')).toHaveLength(1);
		expect(log.filter((entry) => entry === 'leaf:b:cleanup')).toHaveLength(1);
	});

	it('re-renders unchanged-prop descendants when a context value they read changes', () => {
		const Theme = createContext('light');
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const pressPlan = universalPlan('object', { kind: 'host', type: 'presser', propsSlot: 0 });
		const labelPlan = universalPlan('object', {
			kind: 'host',
			type: 'label',
			bindings: [['value', 0]],
		});
		// The reader sits two components below the provider with stable props, so
		// only the changed context value can force it to re-render.
		const Reader = defineUniversalComponent('object', () => {
			const theme = useContext(Theme);
			return universalValue(labelPlan, [`theme:${theme}`]);
		});
		const Middle = defineUniversalComponent('object', () => universalComponent('object', Reader));
		const App = defineUniversalComponent('object', () => {
			const [theme, setTheme] = useState('light', 'theme');
			return [
				universalValue(pressPlan, [
					universalProps([
						['set', 'value', theme],
						['set', 'onPress', () => setTheme((value) => (value === 'light' ? 'dark' : 'light'))],
					]),
				]),
				universalContext(Theme, theme, [universalComponent('object', Middle)]),
			];
		});

		root.render(App, undefined);
		const toggle = container.children[0];
		const label = container.children[1];
		expect(label.props.value).toBe('theme:light');

		flushUniversalSync(() => container.dispatchEvent(toggle, 'press', {}));
		expect(container.children[1]).toBe(label);
		expect(label.props.value).toBe('theme:dark');

		flushUniversalSync(() => container.dispatchEvent(toggle, 'press', {}));
		expect(label.props.value).toBe('theme:light');
		root.unmount();
	});

	it('reorders and removes untouched stateful children from parent state', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const pressPlan = universalPlan('object', { kind: 'host', type: 'presser', propsSlot: 0 });
		const log: string[] = [];
		const Item = defineUniversalComponent('object', ({ id }: { id: string }) => {
			const [count, setCount] = useState(0, 'count');
			useLayoutEffect(
				() => {
					log.push(`item:${id}:mount`);
					return () => log.push(`item:${id}:cleanup`);
				},
				[],
				'item-effect',
			);
			return universalValue(pressPlan, [
				universalProps([
					['set', 'value', `${id}:${count}`],
					['set', 'onPress', () => setCount((value) => value + 1)],
				]),
			]);
		});
		let apply!: (ids: string[]) => void;
		const App = defineUniversalComponent('object', () => {
			const [ids, setIds] = useState(['a', 'b', 'c'], 'ids');
			apply = (next) => setIds(next);
			return ids.map((id) => universalComponent('object', Item, { id }, id));
		});

		root.render(App, undefined);
		const [itemA, itemB, itemC] = container.children;
		flushUniversalSync(() => container.dispatchEvent(itemB, 'press', {}));
		expect(itemB.props.value).toBe('b:1');

		// The parent's own state reorders children it does not otherwise touch:
		// each keeps its host identity, accumulated state, and handlers.
		flushUniversalSync(() => apply(['c', 'a', 'b']));
		expect(container.children).toEqual([itemC, itemA, itemB]);
		flushUniversalSync(() => container.dispatchEvent(itemB, 'press', {}));
		expect(itemB.props.value).toBe('b:2');
		expect(log.filter((entry) => entry.endsWith('mount'))).toHaveLength(3);

		// Removing an untouched child still runs its cleanup and frees its host.
		flushUniversalSync(() => apply(['c', 'b']));
		expect(container.children).toEqual([itemC, itemB]);
		expect(log.filter((entry) => entry === 'item:a:cleanup')).toHaveLength(1);

		// Re-adding mounts a fresh instance rather than resurrecting disposed state.
		flushUniversalSync(() => apply(['c', 'b', 'a']));
		expect(container.children[2].props.value).toBe('a:0');
		expect(log.filter((entry) => entry === 'item:a:mount')).toHaveLength(2);
		root.unmount();
	});

	it('reveals initially suspended stateless content beside retained siblings on resolve', async () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const bodyPlan = universalPlan('object', { kind: 'host', type: 'primary', propsSlot: 0 });
		const fallbackPlan = universalPlan('object', {
			kind: 'host',
			type: 'fallback',
			bindings: [['value', 0]],
		});
		const labelPlan = universalPlan('object', {
			kind: 'host',
			type: 'label',
			bindings: [['value', 0]],
		});
		let resolveAsset!: (value: string) => void;
		const asset = new Promise<string>((resolve) => {
			resolveAsset = resolve;
		});
		// The suspended content carries no hook state and queues no updates, so
		// its post-resolve replay is driven purely by the boundary retry. Nothing
		// about its committed (fallback-arm) output may be adopted as-is.
		const Asset = defineUniversalComponent('object', () => {
			const value = use(asset);
			return universalValue(bodyPlan, [universalProps([['set', 'value', value]])]);
		});
		const Sibling = defineUniversalComponent('object', () =>
			universalValue(labelPlan, ['sibling']),
		);
		// The boundary lives inside a child component whose props never change, so
		// the post-resolve replay reaches it through a claim that looks clean from
		// above: exactly the shape where stale committed arms must not be adopted.
		const Panel = defineUniversalComponent('object', () => [
			universalTry(
				() => universalComponent('object', Asset),
				() => universalValue(fallbackPlan, ['pending']),
				() => null,
			),
			universalComponent('object', Sibling),
		]);
		const App = defineUniversalComponent('object', () => universalComponent('object', Panel));

		root.render(App, undefined);
		expect(container.children.map((child) => child.type)).toEqual(['fallback', 'label']);
		const sibling = container.children[1];

		resolveAsset('loaded');
		await asset;
		for (let index = 0; index < 8; index++) await Promise.resolve();

		expect(container.children.map((child) => child.type)).toEqual(['primary', 'label']);
		expect(container.children[0].props.value).toBe('loaded');
		expect(container.children[1]).toBe(sibling);
		root.unmount();
	});

	it('rejects a nested priority change and still closes the outer scope', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', () =>
			universalValue(universalPlan('object', { kind: 'host', type: 'scene' })),
		);
		root.render(Scene, undefined);

		expect(() =>
			root.eventScope('discrete', () => root.eventScope('continuous', () => {})),
		).toThrow(/must retain priority "discrete"/);
		expect(() => root.eventScope('default', () => {})).not.toThrow();
		root.unmount();
	});
});
