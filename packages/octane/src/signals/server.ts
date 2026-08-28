/** Server twin selected by the native-read compiler for octane/signals/client. */
import { nativeLocalHook } from '../runtime.server.js';
import { createLocalScope } from './engine.js';
import type { Scope, WritableSignal } from './types.js';

interface LocalSignalCell<T> {
	scope: Scope;
	signal$: WritableSignal<T>;
}

function disposeLocalSignal(cell: { scope: Scope }): void {
	cell.scope.dispose();
}

/** Local server state is recreated on a new pass and never enters shared seeds. */
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
