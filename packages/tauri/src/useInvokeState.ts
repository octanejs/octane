import { invoke } from '@tauri-apps/api/core';
import type { InvokeArgs } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'octane';
import {
	TauriUnavailableError,
	argsKey,
	hasTauriHost,
	headersKey,
	splitSlot,
	subSlot,
} from './internal';
import type { UseInvokeOptions } from './useInvoke';

export interface InvokeState<T> {
	status: 'pending' | 'success' | 'error';
	data: T | undefined;
	error: unknown;
	/** Re-run the command. Returns the state to `pending` and clears `data`. */
	refetch: () => void;
}

type Settled<T> = Pick<InvokeState<T>, 'status' | 'data' | 'error'>;
/** A settled result stamped with the request key that produced it. */
type Snapshot<T> = Settled<T> & { key: readonly unknown[] };

const PENDING: Settled<never> = { status: 'pending', data: undefined, error: undefined };

/** Elementwise `Object.is`, matching how the effect below compares the same key. */
function sameRequest(a: readonly unknown[], b: readonly unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!Object.is(a[i], b[i])) return false;
	}
	return true;
}

export function useInvokeState<T>(
	cmd: string,
	args?: InvokeArgs,
	options?: UseInvokeOptions,
): InvokeState<T>;
export function useInvokeState<T>(
	cmd: string,
	args: InvokeArgs | undefined,
	options: UseInvokeOptions | undefined,
	slot: symbol | undefined,
): InvokeState<T>;
export function useInvokeState<T>(
	cmd: string,
	...rest: [InvokeArgs?, UseInvokeOptions?, symbol?]
): InvokeState<T> {
	const [args, slot] = splitSlot(rest);
	const invokeArgs = args[0] as InvokeArgs | undefined;
	const options = args[1] as UseInvokeOptions | undefined;
	const headers = options?.headers;
	const deps = [cmd, headersKey(headers), ...(options?.deps ?? [argsKey(invokeArgs)])];

	const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(
		null,
		subSlot(slot, 'invokeState:settled'),
	);
	const [attempt, retry] = useReducer(
		(count: number) => count + 1,
		0,
		subSlot(slot, 'invokeState:attempt'),
	);
	const request = [...deps, attempt];

	// Deriving the reset rather than deferring it to the effect is what upholds
	// the no-stale-while-revalidate contract: the very render that first observes
	// a new command, args, or attempt reports `pending` instead of handing back
	// the previous request's payload for a frame.
	const settled: Settled<T> =
		snapshot !== null && sameRequest(snapshot.key, request) ? snapshot : (PENDING as Settled<T>);

	useEffect(
		() => {
			if (!hasTauriHost()) {
				setSnapshot({
					status: 'error',
					data: undefined,
					error: new TauriUnavailableError(`useInvokeState('${cmd}')`),
					key: request,
				});
				return;
			}
			let disposed = false;
			invoke<T>(cmd, invokeArgs, headers === undefined ? undefined : { headers }).then(
				(data) => {
					// The cleanup below runs before a deps-change or refetch re-entry, so
					// an in-flight command can never overwrite the request that replaced it.
					if (!disposed) setSnapshot({ status: 'success', data, error: undefined, key: request });
				},
				(error) => {
					if (!disposed) setSnapshot({ status: 'error', data: undefined, error, key: request });
				},
			);
			return () => {
				disposed = true;
			};
		},
		request,
		subSlot(slot, 'invokeState:effect'),
	);

	const refetch = useCallback(() => retry(0), [], subSlot(slot, 'invokeState:refetch'));

	return useMemo(
		() => ({ status: settled.status, data: settled.data, error: settled.error, refetch }),
		[settled, refetch],
		subSlot(slot, 'invokeState:result'),
	);
}
