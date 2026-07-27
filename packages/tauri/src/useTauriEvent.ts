import { listen } from '@tauri-apps/api/event';
import type {
	EventCallback,
	EventName,
	EventTarget as TauriEventTarget,
	UnlistenFn,
} from '@tauri-apps/api/event';
import { useEffect, useReducer, useRef } from 'octane';
import { TauriUnavailableError, hasTauriHost, splitSlot, subSlot } from './internal';

export interface UseTauriEventOptions {
	/** Event target to listen to. Defaults to `{ kind: 'Any' }`. */
	target?: string | TauriEventTarget;
	/** Subscribe only while true. Defaults to true. */
	enabled?: boolean;
	/**
	 * Receive a failed subscription instead of having it thrown to the enclosing
	 * boundary. Supply this for a supplementary subscription whose loss should
	 * not take the subtree down; leave it off so a missing capability is loud.
	 */
	onError?: (error: unknown) => void;
}

function targetKey(target: string | TauriEventTarget | undefined): string | undefined {
	if (target === undefined || typeof target === 'string') return target;
	return 'label' in target ? `${target.kind}:${target.label}` : target.kind;
}

/**
 * Subscribe to a Tauri event for the lifetime of the call site.
 *
 * `handler` and `onError` are read through refs, so an inline closure does not
 * resubscribe: only `event`, `target`, and `enabled` do.
 */
export function useTauriEvent<T>(
	event: EventName,
	handler: EventCallback<T>,
	options?: UseTauriEventOptions,
): void;
export function useTauriEvent<T>(
	event: EventName,
	handler: EventCallback<T>,
	options: UseTauriEventOptions | undefined,
	slot: symbol | undefined,
): void;
export function useTauriEvent<T>(
	event: EventName,
	handler: EventCallback<T>,
	...rest: [UseTauriEventOptions?, symbol?]
): void {
	const [args, slot] = splitSlot(rest);
	const options = args[0] as UseTauriEventOptions | undefined;
	const enabled = options?.enabled ?? true;
	const target = options?.target;

	const latest = useRef(handler, subSlot(slot, 'event:handler'));
	latest.current = handler;
	const latestOnError = useRef(options?.onError, subSlot(slot, 'event:onError'));
	latestOnError.current = options?.onError;
	const failure = useRef<unknown>(undefined, subSlot(slot, 'event:failure'));
	const [, rerender] = useReducer((count: number) => count + 1, 0, subSlot(slot, 'event:update'));

	useEffect(
		() => {
			if (!enabled) return;
			// Reporting through onError keeps the component committed, so flipping
			// `enabled` or changing the event retries. A thrown failure destroys the
			// component instead, and only the boundary's reset() brings it back.
			const report = (error: unknown) => {
				const onError = latestOnError.current;
				if (onError !== undefined) onError(error);
				else {
					failure.current = error;
					rerender(0);
				}
			};

			if (!hasTauriHost()) {
				report(new TauriUnavailableError(`useTauriEvent('${event}')`));
				return;
			}
			// listen() resolves its unlisten function asynchronously. Unmounting
			// before that lands must still detach, or the listener outlives the
			// component and its handler ref forever.
			let disposed = false;
			let unlisten: UnlistenFn | undefined;
			listen<T>(
				event,
				(payload) => latest.current(payload),
				target === undefined ? undefined : { target },
			).then(
				(stop) => {
					if (disposed) stop();
					else unlisten = stop;
				},
				(error) => {
					if (!disposed) report(error);
				},
			);
			return () => {
				disposed = true;
				unlisten?.();
			};
		},
		[event, enabled, targetKey(target)],
		subSlot(slot, 'event:effect'),
	);

	if (failure.current !== undefined) throw failure.current;
}
