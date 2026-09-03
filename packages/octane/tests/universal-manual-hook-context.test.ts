import { describe, expect, it } from 'vitest';
import * as Universal from '../src/universal.js';
import * as Native from '../src/universal-native.js';

describe.each([
	['universal', Universal],
	['native', Native],
] as const)('%s manual hook providers', (_, Runtime) => {
	it('preserves authored Symbols while supplying provider slots through aliases', async () => {
		const value = Symbol('authored value');
		const site = Symbol('manual site');
		const automaticSite = Symbol('automatic site');
		const stateSlot = Symbol('empty state');
		const refSlot = Symbol('empty ref');
		let setValue!: (next: symbol) => void;
		let report: unknown;
		const useManual = Runtime.manualHook(function useManual(input: symbol, slot?: symbol) {
			const [state, set] = Runtime.useState(input, slot);
			const [empty, , getEmpty] = Runtime.__useStateWithGetter(stateSlot);
			const emptyRef = Runtime.useRef(refSlot);
			const automatic = Runtime.withSlot(automaticSite, Runtime.useState, input)[0];
			setValue = set;
			return {
				state,
				empty,
				getter: getEmpty(),
				emptyRef: emptyRef.current,
				automatic,
				slot,
				argc: arguments.length,
			};
		});
		const bound = useManual.bind(undefined);
		const forward = (input: symbol) => bound(input);
		const plan = Runtime.universalPlan('object', { kind: 'host', type: 'node' });
		const Component = Runtime.defineUniversalComponent('object', () => {
			report = Runtime.withSlot(site, forward, value);
			return Runtime.universalValue(plan, []);
		});
		const container = Runtime.createObjectContainer();
		const root = Runtime.createUniversalRoot(container, Runtime.createObjectDriver());
		try {
			root.render(Component, undefined);
			expect(report).toEqual({
				state: value,
				empty: undefined,
				getter: undefined,
				emptyRef: undefined,
				automatic: value,
				slot: site,
				argc: 2,
			});
			const next = Symbol('next state');
			setValue(next);
			await Promise.resolve();
			expect(report).toEqual({
				state: next,
				empty: undefined,
				getter: undefined,
				emptyRef: undefined,
				automatic: value,
				slot: site,
				argc: 2,
			});
		} finally {
			root.unmount();
		}
	});

	it('preserves direct and nested explicit slots without adding another argument', () => {
		const input = Symbol('input');
		const outerSite = Symbol('outer site');
		const innerSite = Symbol('inner site');
		const directSite = Symbol('direct site');
		const useInner = Runtime.manualHook(function useInner(value: symbol, slot?: symbol) {
			const [state] = Runtime.useState(value, slot);
			return { state, slot, argc: arguments.length };
		});
		const useOuter = Runtime.manualHook(function useOuter(value: symbol, slot?: symbol) {
			return { inner: useInner(value, innerSite), slot, argc: arguments.length };
		});
		const plan = Runtime.universalPlan('object', { kind: 'host', type: 'node' });
		let report: unknown;
		const Component = Runtime.defineUniversalComponent('object', () => {
			report = {
				outer: Runtime.withSlot(outerSite, useOuter, input),
				direct: useInner(input, directSite),
			};
			return Runtime.universalValue(plan, []);
		});
		const root = Runtime.createUniversalRoot(
			Runtime.createObjectContainer(),
			Runtime.createObjectDriver(),
		);
		try {
			root.render(Component, undefined);
			expect(report).toEqual({
				outer: { inner: { state: input, slot: innerSite, argc: 2 }, slot: outerSite, argc: 2 },
				direct: { state: input, slot: directSite, argc: 2 },
			});
		} finally {
			root.unmount();
		}
	});

	it('keeps direct Symbol initializers and restores provider context after throws', () => {
		const value = Symbol('data');
		const site = Symbol('site');
		const fail = Runtime.manualHook(() => {
			throw new Error('provider failed');
		});
		const plan = Runtime.universalPlan('object', { kind: 'host', type: 'node' });
		let report: unknown;
		const Component = Runtime.defineUniversalComponent('object', () => {
			expect(() => Runtime.withSlot(site, fail)).toThrow('provider failed');
			const [state] = Runtime.useState(value);
			const ref = Runtime.useRef(value);
			report = { state, ref: ref.current };
			return Runtime.universalValue(plan, []);
		});
		const root = Runtime.createUniversalRoot(
			Runtime.createObjectContainer(),
			Runtime.createObjectDriver(),
		);
		try {
			root.render(Component, undefined);
			expect(report).toEqual({ state: value, ref: value });
		} finally {
			root.unmount();
		}
	});
});
