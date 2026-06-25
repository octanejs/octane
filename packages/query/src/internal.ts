// Shared internals for the binding hooks.
import { shouldThrowError } from '@tanstack/query-core';

// Derive a stable, distinct sub-slot from a wrapper's compiler-injected slot, so
// a hook composing multiple base hooks gives each one its own identity. Tags are
// namespaced per hook (e.g. ':oq:obs', ':ms:cb') to avoid cross-hook collisions.
export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':' + tag) : undefined;
}

// Split the compiler-injected trailing slot off a hook's runtime args, returning
// the user args (everything before it) and the slot.
export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	return [slot !== undefined ? args.slice(0, -1) : args, slot];
}

// react-query's default suspense throwOnError: only throw if there's no data.
export const defaultThrowOnError = (_error: unknown, query: any): boolean =>
	query.state.data === undefined;

// react-query's ensureSuspenseTimers: a suspense query gets a >=1s staleTime/gcTime
// floor so it can't immediately refetch and re-trigger the fallback in a loop.
export function ensureSuspenseTimers(defaultedOptions: any): void {
	if (defaultedOptions.suspense) {
		const MIN = 1000;
		const clamp = (value: any) => (value === 'static' ? value : Math.max(value ?? MIN, MIN));
		const orig = defaultedOptions.staleTime;
		defaultedOptions.staleTime =
			typeof orig === 'function' ? (...args: any[]) => clamp(orig(...args)) : clamp(orig);
		if (typeof defaultedOptions.gcTime === 'number') {
			defaultedOptions.gcTime = Math.max(defaultedOptions.gcTime, MIN);
		}
	}
}

// prevent-error-boundary-retry: when a query opts into throwing, don't retry on
// mount so an already-errored cached query re-throws immediately. octane ships no
// QueryErrorResetBoundary, so `isReset()` is treated as always-false.
export function ensurePreventErrorBoundaryRetry(options: any, query: any): void {
	const throwOnError =
		query?.state.error && typeof options.throwOnError === 'function'
			? shouldThrowError(options.throwOnError, [query.state.error, query])
			: options.throwOnError;
	if (options.suspense || throwOnError) {
		options.retryOnMount = false;
	}
}

export const shouldSuspend = (defaultedOptions: any, result: any): boolean =>
	defaultedOptions?.suspense && result.isPending;

// react-query's getHasError, minus the reset-boundary term (no boundary shipped).
export function getHasError(result: any, throwOnError: any, query: any, suspense: any): boolean {
	return (
		result.isError &&
		!result.isFetching &&
		query &&
		((suspense && result.data === undefined) ||
			shouldThrowError(throwOnError, [result.error, query]))
	);
}
