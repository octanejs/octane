/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * Adapted for Octane from react-is 19.2.7 under the MIT license.
 * See LICENSE.upstream and UPSTREAM.md.
 */
import { Activity, StrictMode as OctaneStrictMode } from 'octane';
import type { ElementDescriptor } from 'octane';

export const ContextConsumer: symbol = Symbol.for('octane.consumer');
export const ContextProvider: symbol = Symbol.for('octane.context');
export const Element: symbol = Symbol.for('octane.element');
export const ForwardRef: symbol = Symbol.for('octane.forward_ref');
export const Fragment: symbol = Symbol.for('octane.Fragment');
export const Lazy: symbol = Symbol.for('octane.lazy');
export const Memo: symbol = Symbol.for('octane.memo');
export const Portal: symbol = Symbol.for('octane.portal');
export const Profiler: symbol = Symbol.for('octane.profiler');
export const StrictMode: symbol = Symbol.for('octane.strict_mode');
export const Suspense: symbol = Symbol.for('octane.suspense');
export const SuspenseList: symbol = Symbol.for('octane.suspense_list');

interface BrandedValue {
	$$kind?: unknown;
	type?: unknown;
}
interface ComponentMetadata extends Function {
	$$kind?: unknown;
	Provider?: unknown;
	__memo?: unknown;
	[key: symbol]: unknown;
}

/** Return an Octane kind label without executing a component or lazy loader. */
export function typeOf(value: unknown): symbol | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const descriptor = value as BrandedValue;
	if (descriptor.$$kind === Portal) return Portal;
	if (descriptor.$$kind !== Element) return undefined;
	const type = descriptor.type;
	if (type === Fragment) return Fragment;
	if (type === OctaneStrictMode) return StrictMode;
	if (typeof type === 'function') {
		const component = type as ComponentMetadata;
		if (component[Suspense] === true) return Suspense;
		if (component.$$kind === ContextProvider && component.Provider === component)
			return ContextProvider;
		// Lazy may acquire memo bailout metadata after resolving a memo wrapper.
		// Its public kind remains Lazy, and inspecting it never starts the load.
		if (component[Lazy] === true) return Lazy;
		if (component.__memo === true) return Memo;
	}
	return Element;
}

export function isValidElementType(type: unknown): boolean {
	return (
		typeof type === 'string' || typeof type === 'function' || type === Fragment || type === Activity
	);
}
// OCTANE DIVERGENCE[unsupported-renderer-kinds][runtime:62a09aa6f8dfc41c]
// Unsupported renderer kinds remain negative feature probes.
export function isContextConsumer(_value: unknown): boolean {
	return false;
}
export function isContextProvider(value: unknown): boolean {
	return typeOf(value) === ContextProvider;
}
export function isElement(value: unknown): value is ElementDescriptor<unknown> {
	return typeof value === 'object' && value !== null && (value as BrandedValue).$$kind === Element;
}
export function isForwardRef(_value: unknown): boolean {
	return false;
}
export function isFragment(value: unknown): boolean {
	return typeOf(value) === Fragment;
}
export function isLazy(value: unknown): boolean {
	return typeOf(value) === Lazy;
}
export function isMemo(value: unknown): boolean {
	return typeOf(value) === Memo;
}
export function isPortal(value: unknown): boolean {
	return typeOf(value) === Portal;
}
export function isProfiler(_value: unknown): boolean {
	return false;
}
export function isStrictMode(value: unknown): boolean {
	return typeOf(value) === StrictMode;
}
export function isSuspense(value: unknown): boolean {
	return typeOf(value) === Suspense;
}
export function isSuspenseList(_value: unknown): boolean {
	return false;
}
