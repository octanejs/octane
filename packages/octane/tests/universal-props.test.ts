import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalComponent,
	universalPlan,
	universalProps,
	universalValue,
	type ObjectHostInstance,
} from '../src/universal.js';

const hostPlan = universalPlan('object', { kind: 'host', type: 'item', propsSlot: 0 });

describe('universal props', () => {
	it('snapshots ordered spreads before resolving key, children, refs, and symbols', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const reads: string[] = [];
		const token = Symbol('token');
		const ref = () => {};
		const source = Object.create({ inherited: 'excluded' });
		for (const [name, value] of [
			['label', 'first'],
			['key', 'spread-key'],
			['children', 'spread-child'],
			['ref', ref],
			['__proto__', { marker: 'data' }],
			[token, 'symbol-value'],
		] as const) {
			Object.defineProperty(source, name, {
				configurable: true,
				enumerable: true,
				get() {
					reads.push(String(name));
					return value;
				},
			});
		}
		let observed: Record<PropertyKey, unknown> | undefined;
		const Child = defineUniversalComponent('object', (props: Record<PropertyKey, unknown>) => {
			observed = props;
			return universalValue(hostPlan, [{ label: props.label, children: props.children }]);
		});
		const Scene = defineUniversalComponent('object', () =>
			universalComponent(
				'object',
				Child,
				universalProps(
					[
						['set', 'key', 'before'],
						['spread', source],
						['set', 'label', 'last'],
						['set', 'key', 'after'],
					],
					'positional-child',
				),
			),
		);
		root.render(Scene, {});
		expect(reads).toEqual(['label', 'key', 'children', 'ref', '__proto__', 'Symbol(token)']);
		expect(Reflect.ownKeys(observed!)).toEqual(['__proto__', 'label', 'children', 'ref', token]);
		expect(Object.getPrototypeOf(observed)).toBe(Object.prototype);
		expect(observed).toMatchObject({ label: 'last', children: 'positional-child', ref });
		expect(observed!.__proto__).toEqual({ marker: 'data' });
		expect(observed![token]).toBe('symbol-value');
		expect(container.children[0].children[0].props.value).toBe('positional-child');
		root.unmount();
	});

	it.each([false, true])(
		'keeps spread key and getter semantics with host aliases %s',
		(canonicalizeHostClass) => {
			const reads: string[] = [];
			const source: Record<string, unknown> = {
				get first() {
					reads.push('first');
					delete source.removed;
					return 1;
				},
				get key() {
					reads.push('key');
					return 'spread';
				},
				get removed(): unknown {
					throw new Error('deleted getter');
				},
			};
			Object.defineProperty(source, 'hidden', {
				get() {
					throw new Error('hidden getter');
				},
			});
			const value = universalProps(
				[
					['set', 'key', 'explicit'],
					['spread', source],
				],
				undefined,
				canonicalizeHostClass,
			);
			expect(reads).toEqual(['first', 'key']);
			expect(value.key).toBe('spread');
			expect(value.hasKey).toBe(true);
			expect(value.props).toEqual({ first: 1 });
			expect(Object.isFrozen(value.props)).toBe(true);
			expect(universalProps([['set', 'key', undefined]]).hasKey).toBe(true);
		},
	);

	it('separates host callbacks and reserved props while retaining data order and symbols', () => {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const token = Symbol('host-token');
		const log: string[] = [];
		const ref = (host: ObjectHostInstance | null) =>
			log.push(host === null ? 'ref:null' : 'ref:item');
		const attach = () => {
			log.push('attach');
			return () => log.push('detach');
		};
		const onUpdate = () => log.push('update');
		const onSelect = () => log.push('select');
		const Scene = defineUniversalComponent(
			'object',
			({ version, invalid }: { version: number; invalid: boolean }) =>
				universalValue(hostPlan, [
					universalProps(
						[
							['set', 'first', version],
							['set', 'onSelect', invalid ? 42 : onSelect],
							['set', 'ref', ref],
							['set', '__proto__', 'ordinary-data'],
							['set', 'onUpdate', onUpdate],
							['set', 'attach', attach],
							['set', 'onUnused', null],
							['set', 'last', 'tail'],
							['spread', { [token]: 'token-value' }],
						],
						`child:${version}`,
					),
				]),
		);
		root.render(Scene, { version: 1, invalid: false });
		const item = container.children[0];
		expect(Object.keys(item.props)).toEqual(['first', 'last']);
		// Ordinary Object.assign semantics for an own __proto__ spread apply before
		// host filtering; a primitive value does not become an own host property.
		expect(Object.getPrototypeOf(item.props)).toBe(Object.prototype);
		expect(Reflect.get(item.props, token)).toBe('token-value');
		expect(item.children[0].props.value).toBe('child:1');
		expect(log).toEqual(['attach', 'update', 'ref:item']);
		container.dispatchEvent(item, 'select', undefined);
		expect(log.at(-1)).toBe('select');
		const beforeFailure = [...log];
		expect(() => root.render(Scene, { version: 2, invalid: true })).toThrow(/must be a function/);
		expect(container.children[0]).toBe(item);
		expect(item.props.first).toBe(1);
		expect(log).toEqual(beforeFailure);
		root.render(Scene, { version: 3, invalid: false });
		expect(container.children[0]).toBe(item);
		expect(item.props.first).toBe(3);
		expect(item.children[0].props.value).toBe('child:3');
		root.unmount();
		expect(log.slice(-2)).toEqual(['detach', 'ref:null']);
	});

	it('preserves own prototype data in a plan when a preceding event is removed', () => {
		const token = Symbol('plan-token');
		const props = JSON.parse('{"onSelect":null,"__proto__":{"marker":"data"},"last":2}');
		props[token] = 'symbol-value';
		const plan = universalPlan('object', { kind: 'host', type: 'item', props });
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const Scene = defineUniversalComponent('object', () => universalValue(plan));
		root.render(Scene, {});
		const observed = container.children[0].props;
		expect(Object.keys(observed)).toEqual(['__proto__', 'last']);
		expect(Object.getPrototypeOf(observed)).toBe(Object.prototype);
		expect(Object.hasOwn(observed, '__proto__')).toBe(true);
		expect(observed.__proto__).toEqual({ marker: 'data' });
		expect(Reflect.get(observed, token)).toBe('symbol-value');
		root.unmount();
	});
});
