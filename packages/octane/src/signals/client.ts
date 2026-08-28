/** Optional component hooks for the native-read DOM compiler mode. */
import { nativeLocalHook } from '../runtime.js';
import { createLocalScope } from './engine.js';
import type { Scope, WritableSignal } from './types.js';

interface LocalSignalCell<T> {
	scope: Scope;
	signal$: WritableSignal<T>;
}

function disposeLocalSignal(cell: { scope: Scope }): void {
	cell.scope.dispose();
}

/** A writable signal owned by this compiler-assigned component hook slot. */
export function useSignal$<T>(initial: T | (() => T), slot?: symbol): WritableSignal<T>;
export function useSignal$<T>(initial: T | (() => T), slot?: symbol | number): WritableSignal<T> {
	const cell = nativeLocalHook<LocalSignalCell<T>>(
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
