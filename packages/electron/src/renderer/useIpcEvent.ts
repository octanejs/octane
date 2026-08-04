import { useEffect, useReducer, useRef } from 'octane';
import { ElectronUnavailableError, getElectronBridge, splitSlot, subSlot } from './internal';

export interface UseIpcEventOptions {
	/** Subscribe only while true. Defaults to true. */
	enabled?: boolean;
	/**
	 * Receive a failed subscription instead of having it thrown to the enclosing
	 * boundary. Supply this for a supplementary subscription whose loss should
	 * not take the subtree down.
	 */
	onError?: (error: unknown) => void;
}

/**
 * Subscribe to an Electron IPC channel for the lifetime of the call site.
 * The bridge strips Electron's event object so handlers receive payload args.
 */
export function useIpcEvent(
	channel: string,
	handler: (...args: unknown[]) => void,
	options?: UseIpcEventOptions,
): void;
export function useIpcEvent(
	channel: string,
	handler: (...args: unknown[]) => void,
	options: UseIpcEventOptions | undefined,
	slot: symbol | undefined,
): void;
export function useIpcEvent(
	channel: string,
	handler: (...args: unknown[]) => void,
	...rest: [UseIpcEventOptions?, symbol?]
): void {
	const [args, slot] = splitSlot(rest);
	const options = args[0] as UseIpcEventOptions | undefined;
	const enabled = options?.enabled ?? true;

	const latest = useRef(handler, subSlot(slot, 'event:handler'));
	latest.current = handler;
	const latestOnError = useRef(options?.onError, subSlot(slot, 'event:onError'));
	latestOnError.current = options?.onError;
	const failure = useRef<unknown>(undefined, subSlot(slot, 'event:failure'));
	const [, rerender] = useReducer((count: number) => count + 1, 0, subSlot(slot, 'event:update'));

	useEffect(
		() => {
			if (!enabled) return;
			const report = (error: unknown) => {
				const onError = latestOnError.current;
				if (onError !== undefined) onError(error);
				else {
					failure.current = error;
					rerender(0);
				}
			};

			const bridge = getElectronBridge();
			if (bridge === undefined) {
				report(new ElectronUnavailableError(`useIpcEvent('${channel}')`));
				return;
			}

			try {
				return bridge.on(channel, (...payload) => latest.current(...payload));
			} catch (error) {
				report(error);
			}
		},
		[channel, enabled],
		subSlot(slot, 'event:effect'),
	);

	if (failure.current !== undefined) throw failure.current;
}
