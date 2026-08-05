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
	universalPlan,
	universalProps,
	universalValue,
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
