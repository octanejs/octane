import { use, useMemo } from 'octane';
import {
	ElectronUnavailableError,
	argsKey,
	getElectronBridge,
	splitSlot,
	subSlot,
} from './internal';

export interface UseInvokeOptions {
	/**
	 * Extra refetch key, appended to the channel rather than replacing it.
	 * Defaults to the argument values.
	 */
	deps?: readonly unknown[];
}

export function useInvoke<T>(channel: string, args?: unknown, options?: UseInvokeOptions): T;
export function useInvoke<T>(
	channel: string,
	args: unknown | undefined,
	options: UseInvokeOptions | undefined,
	slot: symbol | undefined,
): T;
export function useInvoke<T>(channel: string, ...rest: [unknown?, UseInvokeOptions?, symbol?]): T {
	const [args, slot] = splitSlot(rest);
	const invokeArgs = args[0];
	const options = args[1] as UseInvokeOptions | undefined;
	const deps = [channel, ...(options?.deps ?? [argsKey(invokeArgs)])];

	const request = useMemo(
		() => {
			const bridge = getElectronBridge();
			const pending =
				bridge !== undefined
					? invokeArgs === undefined
						? bridge.invoke<T>(channel)
						: bridge.invoke<T>(channel, invokeArgs)
					: Promise.reject<T>(new ElectronUnavailableError(`useInvoke('${channel}')`));
			pending.catch(() => {});
			return pending;
		},
		deps,
		subSlot(slot, 'invoke:request'),
	);

	return use(request) as T;
}
