/** Universal twin selected by the universal compiler for octane/signals/client. */
export * from './index.js';
import { formatClientError } from '../error-codes.client.generated.js';
import { createLocalScope } from './engine.js';
import { getUniversalLocalHook } from './local-hook.js';
import type { OwnerScope, WritableSignal } from './types.js';

interface LocalSignalCell<T> {
	scope: OwnerScope;
	signal$: WritableSignal<T>;
}

function disposeLocalSignal(cell: { scope: OwnerScope }): void {
	cell.scope.dispose();
}

/**
 * A writable signal owned by this compiler-assigned component hook slot of a
 * universal renderer component. Handles bound to hosts update them without
 * rendering the component again; the scope is disposed when the component
 * unmounts, not when an Activity hides it.
 */
export function useSignal$<T>(initial: T | (() => T), slot?: symbol): WritableSignal<T>;
export function useSignal$<T>(initial: T | (() => T), slot?: symbol | number): WritableSignal<T> {
	const hook = getUniversalLocalHook();
	if (hook === null) {
		throw new TypeError(formatClientError(374));
	}
	const cell = hook<LocalSignalCell<T>>(
		'useSignal$',
		() => {
			const value = typeof initial === 'function' ? (initial as () => T)() : initial;
			const scope = createLocalScope('octane/useSignal$');
			return { scope, signal$: scope.signal$('value', value) };
		},
		disposeLocalSignal,
		slot,
	);
	return cell.signal$;
}
