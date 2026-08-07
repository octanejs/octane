import { useCallback, useEffect, useMemo, useReducer, useState } from 'octane';
import {
	ElectronUnavailableError,
	argsKey,
	getElectronBridge,
	splitSlot,
	subSlot,
} from './internal';
import type { UseInvokeOptions } from './useInvoke';

export interface InvokeState<T> {
	status: 'pending' | 'success' | 'error';
	data: T | undefined;
	error: unknown;
	/** Re-run the invoke. Returns the state to `pending` and clears `data`. */
	refetch: () => void;
}

type Settled<T> = Pick<InvokeState<T>, 'status' | 'data' | 'error'>;
type Snapshot<T> = Settled<T> & { key: readonly unknown[] };

const PENDING: Settled<never> = { status: 'pending', data: undefined, error: undefined };

function sameRequest(a: readonly unknown[], b: readonly unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!Object.is(a[i], b[i])) return false;
	}
	return true;
}

export function useInvokeState<T>(
	channel: string,
	args?: unknown,
	options?: UseInvokeOptions,
): InvokeState<T>;
export function useInvokeState<T>(
	channel: string,
	args: unknown | undefined,
	options: UseInvokeOptions | undefined,
	slot: symbol | undefined,
): InvokeState<T>;
export function useInvokeState<T>(
	channel: string,
	...rest: [unknown?, UseInvokeOptions?, symbol?]
): InvokeState<T> {
	const [args, slot] = splitSlot(rest);
	const invokeArgs = args[0];
	const options = args[1] as UseInvokeOptions | undefined;
	const deps = [channel, ...(options?.deps ?? [argsKey(invokeArgs)])];

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

	const settled: Settled<T> =
		snapshot !== null && sameRequest(snapshot.key, request) ? snapshot : (PENDING as Settled<T>);

	useEffect(
		() => {
			const bridge = getElectronBridge();
			if (bridge === undefined) {
				setSnapshot({
					status: 'error',
					data: undefined,
					error: new ElectronUnavailableError(`useInvokeState('${channel}')`),
					key: request,
				});
				return;
			}
			let disposed = false;
			const pending =
				invokeArgs === undefined
					? bridge.invoke<T>(channel)
					: bridge.invoke<T>(channel, invokeArgs);
			pending.then(
				(data) => {
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
