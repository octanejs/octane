import { describe, expect, it, vi } from 'vitest';
import * as Universal from '../src/universal.js';
import * as Native from '../src/universal-native.js';

describe.each([
	['universal', Universal],
	['native', Native],
] as const)('%s lazy refs', (_, Runtime) => {
	it('initializes each ref once and preserves arbitrary object slots', () => {
		const makeValue = vi.fn(() => ({ value: 'initialized' }));
		const storedFunction = vi.fn();
		const objectSlot = { lazy: true };
		const lazySlot = Symbol('lazy');
		const plan = Runtime.universalPlan('object', {
			kind: 'host',
			type: 'value',
			bindings: [['value', 0]],
		});
		const Component = Runtime.defineUniversalComponent('object', () => {
			const lazy = Runtime.useLazyRef(makeValue, lazySlot);
			const ordinary = Runtime.useRef(storedFunction, objectSlot);
			return Runtime.universalValue(plan, [
				lazy.current.value + ':' + String(ordinary.current === storedFunction),
			]);
		});
		const container = Runtime.createObjectContainer();
		const root = Runtime.createUniversalRoot(container, Runtime.createObjectDriver());
		try {
			root.render(Component, undefined);
			expect(container.children[0].props.value).toBe('initialized:true');
			root.render(Component, undefined);
			expect(container.children[0].props.value).toBe('initialized:true');
			expect(makeValue).toHaveBeenCalledTimes(1);
			expect(storedFunction).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	it('creates a fresh ref after an uncommitted render is abandoned', () => {
		const observed: object[] = [];
		const plan = Runtime.universalPlan('object', {
			kind: 'host',
			type: 'value',
			bindings: [['value', 0]],
		});
		const Component = Runtime.defineUniversalComponent('object', () => {
			const ref = Runtime.useLazyRef(() => ({}));
			observed.push(ref.current);
			return Runtime.universalValue(plan, [ref.current]);
		});
		const container = Runtime.createObjectContainer();
		const root = Runtime.createUniversalRoot(container, Runtime.createObjectDriver());
		try {
			const prepared = root.prepare(Component, undefined);
			expect(prepared.status).toBe('prepared');
			prepared.abort();
			root.render(Component, undefined);
			expect(observed.length).toBeGreaterThanOrEqual(2);
			expect(observed.at(-1)).not.toBe(observed[0]);
			expect(container.children[0].props.value).toBe(observed.at(-1));
		} finally {
			root.unmount();
		}
	});

	it('retains function and undefined results as values', () => {
		const callback = vi.fn();
		const makeCallback = vi.fn(() => callback);
		const makeUndefined = vi.fn(() => undefined);
		const observed: unknown[][] = [];
		const plan = Runtime.universalPlan('object', { kind: 'host', type: 'value' });
		const Component = Runtime.defineUniversalComponent('object', () => {
			observed.push([
				Runtime.useLazyRef(makeCallback).current,
				Runtime.useLazyRef(makeUndefined).current,
			]);
			return Runtime.universalValue(plan, []);
		});
		const container = Runtime.createObjectContainer();
		const root = Runtime.createUniversalRoot(container, Runtime.createObjectDriver());
		try {
			root.render(Component, undefined);
			root.render(Component, undefined);
			expect(observed.at(-1)).toEqual([callback, undefined]);
			expect(makeCallback).toHaveBeenCalledTimes(1);
			expect(makeUndefined).toHaveBeenCalledTimes(1);
			expect(callback).not.toHaveBeenCalled();
		} finally {
			root.unmount();
		}
	});

	it('retries the factory after a failed initial render', () => {
		const factory = vi
			.fn()
			.mockImplementationOnce(() => {
				throw new Error('factory failed');
			})
			.mockImplementation(() => 'recovered');
		const plan = Runtime.universalPlan('object', {
			kind: 'host',
			type: 'value',
			bindings: [['value', 0]],
		});
		const Component = Runtime.defineUniversalComponent('object', () => {
			const ref = Runtime.useLazyRef(factory);
			return Runtime.universalValue(plan, [ref.current]);
		});
		const container = Runtime.createObjectContainer();
		const root = Runtime.createUniversalRoot(container, Runtime.createObjectDriver());
		try {
			expect(() => root.render(Component, undefined)).toThrow('factory failed');
			expect(container.children).toHaveLength(0);
			root.render(Component, undefined);
			expect(container.children[0].props.value).toBe('recovered');
			expect(factory).toHaveBeenCalledTimes(2);
		} finally {
			root.unmount();
		}
	});
});
