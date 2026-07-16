import { describe, expect, it } from 'vitest';
import {
	type UniversalHostPropCodec,
	type UniversalResourceHandle,
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalPlan,
	universalProps,
	universalValue,
} from '../src/universal.js';

const propsPlan = universalPlan('object', {
	kind: 'host',
	type: 'node',
	propsSlot: 0,
});

describe('universal host prop codecs', () => {
	it('snapshots serializable values and validates root-scoped resource handles', () => {
		let handle: UniversalResourceHandle | undefined;
		const codec: UniversalHostPropCodec<ReturnType<typeof createObjectContainer>> = {
			encode(context) {
				if (context.name === 'resource') {
					if (
						context.value !== null &&
						typeof context.value === 'object' &&
						(context.value as Partial<UniversalResourceHandle>).$$kind ===
							'octane.universal.resource'
					) {
						return { kind: 'resource', handle: context.value as UniversalResourceHandle };
					}
					handle = context.createResourceHandle('texture-1');
					return { kind: 'resource', handle };
				}
				if (typeof context.value === 'function') {
					return { kind: 'unsupported', reason: `unsupported function prop ${context.name}` };
				}
				return { kind: 'value', value: context.value as never };
			},
		};
		const driver = { ...createObjectDriver(), props: codec };
		const firstContainer = createObjectContainer();
		const firstRoot = createUniversalRoot(firstContainer, driver);
		const Scene = defineUniversalComponent(
			'object',
			(props: { config: unknown; resource: unknown; callback?: unknown }) =>
				universalValue(propsPlan, [
					universalProps([
						['set', 'config', props.config],
						['set', 'resource', props.resource],
						['set', 'callback', props.callback],
					]),
				]),
		);
		const config = { nested: { values: [1, 2] } };
		const prepared = firstRoot.prepare(Scene, { config, resource: {} });
		config.nested.values[0] = 99;
		prepared.commit();

		expect(firstContainer.children[0].props.config).toEqual({
			nested: { values: [1, 2] },
		});
		expect(Object.isFrozen(firstContainer.children[0].props.config)).toBe(true);
		expect(firstContainer.children[0].props.resource).toBe(handle);
		expect(handle).toMatchObject({
			$$kind: 'octane.universal.resource',
			renderer: 'object',
			id: 'texture-1',
		});

		const secondContainer = createObjectContainer();
		const secondRoot = createUniversalRoot(secondContainer, driver);
		expect(() => secondRoot.render(Scene, { config: {}, resource: handle! })).toThrow(
			/does not belong to renderer "object" and this root/,
		);
		expect(secondContainer.commits).toHaveLength(0);
		expect(secondContainer.instanceCount).toBe(0);

		expect(() => firstRoot.render(Scene, { config: {}, resource: {}, callback: () => {} })).toThrow(
			'unsupported function prop callback',
		);
		expect(firstContainer.commits).toHaveLength(1);
		firstRoot.unmount();
		secondRoot.unmount();
	});

	it('rejects cyclic and non-plain serializable values before host preparation', () => {
		const codec: UniversalHostPropCodec<ReturnType<typeof createObjectContainer>> = {
			encode: (context) => ({ kind: 'value', value: context.value as never }),
		};
		const driver = { ...createObjectDriver(), props: codec };
		const container = createObjectContainer();
		const root = createUniversalRoot(container, driver);
		const Scene = defineUniversalComponent('object', (props: { value: unknown }) =>
			universalValue(propsPlan, [universalProps([['set', 'value', props.value]])]),
		);
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;

		expect(() => root.render(Scene, { value: cyclic })).toThrow(/cannot contain cycles/);
		expect(() => root.render(Scene, { value: new Date() })).toThrow(/require plain objects/);
		expect(container.commits).toHaveLength(0);
		expect(container.instanceCount).toBe(0);
		root.unmount();
	});

	it('preserves an own __proto__ data key without changing the cloned object prototype', () => {
		const codec: UniversalHostPropCodec<ReturnType<typeof createObjectContainer>> = {
			encode: (context) => ({ kind: 'value', value: context.value as never }),
		};
		const container = createObjectContainer();
		const root = createUniversalRoot(container, { ...createObjectDriver(), props: codec });
		const Scene = defineUniversalComponent('object', (props: { value: unknown }) =>
			universalValue(propsPlan, [universalProps([['set', 'value', props.value]])]),
		);
		const source = JSON.parse('{"__proto__":{"polluted":true},"safe":1}') as Record<
			string,
			unknown
		>;

		root.render(Scene, { value: source });
		const cloned = container.children[0].props.value as Record<string, unknown>;
		expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
		expect(Object.prototype.hasOwnProperty.call(cloned, '__proto__')).toBe(true);
		expect(cloned.__proto__).toEqual({ polluted: true });
		expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
		expect(Object.isFrozen(cloned)).toBe(true);
		root.unmount();
	});
});

describe('universal runtime text policies', () => {
	const textPlan = universalPlan('object', {
		kind: 'range',
		children: [
			{ kind: 'text', value: 'static' },
			{ kind: 'slot', slot: 0 },
			{ kind: 'host', type: 'node' },
		],
	});
	const Scene = defineUniversalComponent('object', () => universalValue(textPlan, [42]));

	it('supports host, ignore, and reject as distinct typed policies', () => {
		const hostContainer = createObjectContainer();
		const hostRoot = createUniversalRoot(hostContainer, createObjectDriver());
		hostRoot.render(Scene, undefined);
		expect(hostContainer.children.map((child) => child.type)).toEqual(['#text', '#text', 'node']);

		const ignoreContainer = createObjectContainer();
		const baseDriver = createObjectDriver();
		const ignoreRoot = createUniversalRoot(ignoreContainer, {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, text: 'ignore' },
		});
		ignoreRoot.render(Scene, undefined);
		expect(ignoreContainer.children.map((child) => child.type)).toEqual(['node']);

		const rejectContainer = createObjectContainer();
		const rejectRoot = createUniversalRoot(rejectContainer, {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, text: 'reject' },
		});
		expect(() => rejectRoot.render(Scene, undefined)).toThrow(/rejects primitive text children/);
		expect(rejectContainer.commits).toHaveLength(0);

		hostRoot.unmount();
		ignoreRoot.unmount();
		rejectRoot.unmount();
	});
});
