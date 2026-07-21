/**
 * Compiler-facing Lynx renderer ABI.
 *
 * Components compile against Octane's host-neutral universal component core;
 * the background root connects that output to the Milestone 3 async host.
 */
import { useId, useLayoutEffect, useMemo } from 'octane/universal/native';
import {
	createLynxMainThreadRefDescriptor,
	releaseLynxMainThreadRefOwner,
	retainLynxMainThreadRefOwner,
	type LynxMainThreadRefCell,
} from './core/worklets.js';

export * from 'octane/universal/native';

export {
	attachThreadFunction,
	bindThreadFunction,
	invokeThreadFunction,
	registerThreadFunction,
	runOnBackground,
	runOnMainThread,
} from './core/worklets.js';
export type {
	LynxBackgroundFunctionDescriptor,
	LynxCancelablePromise,
	LynxMainThreadRefDescriptor,
	LynxMainThreadWorkletDescriptor,
	LynxWorkletValue,
} from './core/worklets.js';

function expectedRefOwnerTeardown(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return /(?:transport was disposed|transport was closed|receiver is closed|call bridge is stale|no installed background call bridge)/.test(
		error.message,
	);
}

function faultedRootRefOwnerTeardown(error: unknown): boolean {
	return error instanceof Error && /main-thread root is faulted/.test(error.message);
}

function reportRefOwnerLifecycleError(error: unknown): void {
	const normalized = error instanceof Error ? error : new Error(String(error));
	void Promise.resolve().then(() => {
		throw normalized;
	});
}

/** Create a deterministic main-thread cell for state or an adopted native node. */
export function useMainThreadRef<T>(initialValue: T): LynxMainThreadRefCell<T>;
export function useMainThreadRef<T = undefined>(): LynxMainThreadRefCell<T | undefined>;
export function useMainThreadRef<T>(
	initialValueOrSlot?: T | unknown,
	slot?: unknown,
): LynxMainThreadRefCell<T | undefined> {
	// Custom hooks receive their compiler Symbol as a trailing argument. With no
	// authored initializer it is the only argument, so split that case explicitly.
	const hasInitialValue = arguments.length > 1 || typeof initialValueOrSlot !== 'symbol';
	const resolvedSlot =
		arguments.length > 1 ? slot : hasInitialValue ? undefined : initialValueOrSlot;
	const initialValue = hasInitialValue ? (initialValueOrSlot as T) : undefined;
	const id = useId(resolvedSlot);
	const descriptor = useMemo(
		() => createLynxMainThreadRefDescriptor(`octane:${id}`, initialValue),
		[],
		'main-thread-ref-descriptor',
	);
	useLayoutEffect(
		() => {
			let disposed = false;
			// The transport queues acknowledgement-time calls behind older IDs. Start
			// ownership synchronously so later layout effects can safely use the ref.
			void retainLynxMainThreadRefOwner(descriptor).catch((error) => {
				// An accepted native fault can reject the ACK-published retain before
				// hook cleanup runs. The root fault is already reported by the transport.
				if (faultedRootRefOwnerTeardown(error)) return;
				if (disposed && expectedRefOwnerTeardown(error)) return;
				reportRefOwnerLifecycleError(error);
			});
			return () => {
				disposed = true;
				void releaseLynxMainThreadRefOwner(descriptor).catch((error) => {
					// Terminal root/controller cleanup owns the registry after its call
					// bridge closes, so an unreachable release is expected during teardown.
					if (faultedRootRefOwnerTeardown(error) || expectedRefOwnerTeardown(error)) return;
					reportRefOwnerLifecycleError(error);
				});
			};
		},
		[descriptor._wvid],
		'main-thread-ref-owner',
	);
	return descriptor as LynxMainThreadRefCell<T | undefined>;
}

export type {
	LynxCustomIntrinsicElements,
	LynxElements,
	LynxIntrinsicElements,
} from './intrinsics.js';
