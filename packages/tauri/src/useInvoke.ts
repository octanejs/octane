import { invoke } from '@tauri-apps/api/core';
import type { InvokeArgs } from '@tauri-apps/api/core';
import { use, useMemo } from 'octane';
import {
	TauriUnavailableError,
	argsKey,
	hasTauriHost,
	headersKey,
	splitSlot,
	subSlot,
} from './internal';

export interface UseInvokeOptions {
	/**
	 * Extra refetch key, appended to the command name and headers rather than
	 * replacing them, so a changed `cmd` or `headers` always refetches. Defaults
	 * to the argument values.
	 */
	deps?: readonly unknown[];
	/** Request headers, forwarded to `invoke`'s `InvokeOptions`. */
	headers?: HeadersInit;
}

export function useInvoke<T>(cmd: string, args?: InvokeArgs, options?: UseInvokeOptions): T;
export function useInvoke<T>(
	cmd: string,
	args: InvokeArgs | undefined,
	options: UseInvokeOptions | undefined,
	slot: symbol | undefined,
): T;
export function useInvoke<T>(cmd: string, ...rest: [InvokeArgs?, UseInvokeOptions?, symbol?]): T {
	const [args, slot] = splitSlot(rest);
	const invokeArgs = args[0] as InvokeArgs | undefined;
	const options = args[1] as UseInvokeOptions | undefined;
	const headers = options?.headers;
	const deps = [cmd, headersKey(headers), ...(options?.deps ?? [argsKey(invokeArgs)])];

	const request = useMemo(
		() => {
			// Suspending on an absent bridge would hang the boundary until the SSR
			// timeout with nothing to report; a rejection reaches @catch instead.
			const pending = hasTauriHost()
				? invoke<T>(cmd, invokeArgs, headers === undefined ? undefined : { headers })
				: Promise.reject<T>(new TauriUnavailableError(`useInvoke('${cmd}')`));
			// A deps change abandons this promise before use() ever observes it.
			pending.catch(() => {});
			return pending;
		},
		deps,
		subSlot(slot, 'invoke:request'),
	);

	return use(request) as T;
}
