import { provideLynxMainThreadWorkletFeature } from './core/main-thread-worklet-feature.js';
import {
	createLynxMainThreadRefDescriptor,
	createLynxMainThreadWorkletRegistry,
	installLynxMainThreadWorkletRegistry,
	installMainThreadCallBridge,
	isLynxBackgroundFunctionDescriptor,
	isolateLynxWorkletValue,
	type LynxMainThreadRefCell,
} from './core/worklets.js';
import { useId, useMemo } from './main-renderer.js';

const MAIN_THREAD_WORKLET_FEATURE = Object.freeze({
	createRegistry: createLynxMainThreadWorkletRegistry,
	installRegistry: installLynxMainThreadWorkletRegistry,
	installCallBridge: installMainThreadCallBridge,
	isolateValue: isolateLynxWorkletValue,
	isBackgroundFunction: isLynxBackgroundFunctionDescriptor,
});

// This module is reachable only when the compiler or authored source retains a
// worklet helper. The receiver is already installed first and subscribes to
// this capability, so provision also supports authored and late chunks.
provideLynxMainThreadWorkletFeature(MAIN_THREAD_WORKLET_FEATURE);

/** Create the same deterministic main-thread cell as the background specialization. */
export function useMainThreadRef<T>(initialValue: T): LynxMainThreadRefCell<T>;
export function useMainThreadRef<T = undefined>(): LynxMainThreadRefCell<T | undefined>;
export function useMainThreadRef<T>(
	initialValueOrSlot?: T | unknown,
	slot?: unknown,
): LynxMainThreadRefCell<T | undefined> {
	const hasInitialValue = arguments.length > 1 || typeof initialValueOrSlot !== 'symbol';
	const resolvedSlot =
		arguments.length > 1 ? slot : hasInitialValue ? undefined : initialValueOrSlot;
	const initialValue = hasInitialValue ? (initialValueOrSlot as T) : undefined;
	const id = useId(resolvedSlot);
	return useMemo(
		() => createLynxMainThreadRefDescriptor(`octane:${id}`, initialValue),
		[],
		'main-thread-ref-descriptor',
	) as LynxMainThreadRefCell<T | undefined>;
}

export {
	attachThreadFunction,
	bindThreadFunction,
	invokeThreadFunction,
	registerThreadFunction,
	runOnBackground,
	runOnMainThread,
	unregisterThreadFunction,
	LynxCrossThreadCallCancelledError,
} from './core/worklets.js';
export type {
	LynxBackgroundFunctionDescriptor,
	LynxCancelablePromise,
	LynxMainThreadRefCell,
	LynxMainThreadRefDescriptor,
	LynxMainThreadWorkletDescriptor,
	LynxWorkletValue,
} from './core/worklets.js';
