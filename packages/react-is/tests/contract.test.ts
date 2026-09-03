import { describe, expect, it, vi } from 'vitest';
import { createContext, createElement, Fragment, lazy, memo, StrictMode, Suspense } from 'octane';
import * as Is from '../src/index.js';
import * as Server from 'octane/server';

describe('Octane element-kind predicates', () => {
	it('classifies server descriptors without importing or invoking their renderer', () => {
		const load = vi.fn(async () => () => null);
		for (const [type, kind] of [
			[Server.Suspense, Is.Suspense],
			[Server.StrictMode, Is.StrictMode],
			[Server.Fragment, Is.Fragment],
			[Server.memo(() => null), Is.Memo],
			[Server.lazy(load), Is.Lazy],
			[Server.createContext(null), Is.ContextProvider],
		] as const) {
			expect(Is.typeOf(Server.createElement(type))).toBe(kind);
		}
		expect(load).not.toHaveBeenCalled();
	});
	it('inspects descriptors without rendering or loading components', () => {
		const component = vi.fn(() => null);
		const load = vi.fn(async () => ({ default: component }));
		const Memo = memo(component);
		const Lazy = lazy(load);
		expect(Is.isMemo(createElement(Memo))).toBe(true);
		expect(Is.isLazy(createElement(Lazy))).toBe(true);
		expect(Is.isMemo(Memo)).toBe(false);
		expect(Is.isLazy(Lazy)).toBe(false);
		expect(Is.isValidElementType(Memo)).toBe(true);
		expect(Is.isValidElementType(Lazy)).toBe(true);
		expect(load).not.toHaveBeenCalled();
		expect(component).not.toHaveBeenCalled();
	});
	it('recognizes public descriptor kinds without React branding', () => {
		const context = createContext('value');
		for (const [type, kind] of [
			[Fragment, Is.Fragment],
			[context, Is.ContextProvider],
			[context.Provider, Is.ContextProvider],
			[StrictMode, Is.StrictMode],
			[Suspense, Is.Suspense],
		] as const) {
			const value = createElement(type);
			expect(Is.isElement(value)).toBe(true);
			expect(Is.typeOf(value)).toBe(kind);
			expect(Object.hasOwn(value, '$$typeof')).toBe(false);
		}
		expect(
			Is.isElement({ $$typeof: Symbol.for('react.transitional.element'), type: 'div', props: {} }),
		).toBe(false);
		expect(Is.isValidElementType(Is.StrictMode)).toBe(false);
		expect(Is.isValidElementType(Is.Suspense)).toBe(false);
		expect(Is.isValidElementType(Is.Fragment)).toBe(true);
	});
	it.each([
		['memo', memo(() => null)],
		['lazy', lazy(async () => () => null)],
		['context', createContext(null)],
	] as const)('does not confuse hoisted %s metadata with the original kind', (_name, Original) => {
		const Hoc = () => null;
		for (const key of Reflect.ownKeys(Original)) {
			if (key === 'name' || key === 'length' || key === 'prototype') continue;
			Object.defineProperty(Hoc, key, Object.getOwnPropertyDescriptor(Original, key)!);
		}
		expect(Is.isMemo(createElement(Hoc))).toBe(false);
		expect(Is.isLazy(createElement(Hoc))).toBe(false);
		expect(Is.isContextProvider(createElement(Hoc))).toBe(false);
		expect(Is.typeOf(createElement(Hoc))).toBe(Is.Element);
	});
	it('retains unsupported predicate exports as negative feature probes', () => {
		for (const [kind, predicate] of [
			[Is.ContextConsumer, Is.isContextConsumer],
			[Is.ForwardRef, Is.isForwardRef],
			[Is.Profiler, Is.isProfiler],
			[Is.SuspenseList, Is.isSuspenseList],
		] as const) {
			expect(Is.isValidElementType(kind)).toBe(false);
			expect(predicate(createElement('div'))).toBe(false);
		}
		expect(Is.isValidElementType({ $$typeof: Symbol.for('react.client.reference') })).toBe(false);
		expect(Is.isValidElementType({ getModuleId() {} })).toBe(false);
	});
});
