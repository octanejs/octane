import { invoke } from '@tauri-apps/api/core';
import type { InvokeArgs } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'octane';
import { TauriUnavailableError, argsKey, hasTauriHost, splitSlot, subSlot } from './internal';
import type { UseInvokeOptions } from './useInvoke';

export interface InvokeState<T> {
	status: 'pending' | 'success' | 'error';
	data: T | undefined;
	error: unknown;
	/** Re-run the command. Returns the state to `pending` and clears `data`. */
	refetch: () => void;
}

type Settled<T> = Pick<InvokeState<T>, 'status' | 'data' | 'error'>;

const PENDING: Settled<never> = { status: 'pending', data: undefined, error: undefined };

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
	const deps = [cmd, ...(options?.deps ?? [argsKey(invokeArgs)])];

	const [settled, setSettled] = useState<Settled<T>>(
		PENDING as Settled<T>,
		subSlot(slot, 'invokeState:settled'),
	);
	const [attempt, retry] = useReducer(
		(count: number) => count + 1,
		0,
		subSlot(slot, 'invokeState:attempt'),
	);

	useEffect(
		() => {
			if (!hasTauriHost()) {
				setSettled({
					status: 'error',
					data: undefined,
					error: new TauriUnavailableError(`useInvokeState('${cmd}')`),
				});
				return;
			}
			let disposed = false;
			setSettled((previous) =>
				previous.status === 'pending' ? previous : (PENDING as Settled<T>),
			);
			invoke<T>(cmd, invokeArgs, headers === undefined ? undefined : { headers }).then(
				(data) => {
					// The cleanup below runs before a deps-change or refetch re-entry, so
					// an in-flight command can never overwrite the request that replaced it.
					if (!disposed) setSettled({ status: 'success', data, error: undefined });
				},
				(error) => {
					if (!disposed) setSettled({ status: 'error', data: undefined, error });
				},
			);
			return () => {
				disposed = true;
			};
		},
		[...deps, attempt],
		subSlot(slot, 'invokeState:effect'),
	);

	const refetch = useCallback(() => retry(0), [], subSlot(slot, 'invokeState:refetch'));

	return useMemo(
		() => ({ status: settled.status, data: settled.data, error: settled.error, refetch }),
		[settled, refetch],
		subSlot(slot, 'invokeState:result'),
	);
}
