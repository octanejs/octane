import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	universalPlan,
	universalProps,
	universalValue,
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
