// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useGlobalListeners.ts).
import { useCallback, useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

export interface GlobalListeners {
	addGlobalListener<K extends keyof WindowEventMap>(
		el: Window,
		type: K,
		listener: (this: Document, ev: WindowEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	): void;
	addGlobalListener<K extends keyof DocumentEventMap>(
		el: EventTarget,
		type: K,
		listener: (this: Document, ev: DocumentEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	): void;
	addGlobalListener(
		el: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeGlobalListener<K extends keyof DocumentEventMap>(
		el: EventTarget,
		type: K,
		listener: (this: Document, ev: DocumentEventMap[K]) => any,
		options?: boolean | EventListenerOptions,
	): void;
	removeGlobalListener(
		el: EventTarget,
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void;
	removeAllGlobalListeners(): void;
}

export function useGlobalListeners(): GlobalListeners;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGlobalListeners(slot: symbol | undefined): GlobalListeners;
export function useGlobalListeners(...args: any[]): GlobalListeners {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGlobalListeners');

	let globalListeners = useRef(new Map(), subSlot(slot, 'map'));
	let addGlobalListener = useCallback(
		(eventTarget: any, type: any, listener: any, options: any) => {
			// Make sure we remove the listener after it is called with the `once` option.
			let fn = options?.once
				? (...args: any[]) => {
						globalListeners.current.delete(listener);
						listener(...args);
					}
				: listener;
			globalListeners.current.set(listener, { type, eventTarget, fn, options });
			eventTarget.addEventListener(type, fn, options);
		},
		[],
		subSlot(slot, 'add'),
	);
	let removeGlobalListener = useCallback(
		(eventTarget: any, type: any, listener: any, options: any) => {
			let fn = globalListeners.current.get(listener)?.fn || listener;
			eventTarget.removeEventListener(type, fn, options);
			globalListeners.current.delete(listener);
		},
		[],
		subSlot(slot, 'remove'),
	);
	let removeAllGlobalListeners = useCallback(
		() => {
			globalListeners.current.forEach((value: any, key: any) => {
				removeGlobalListener(value.eventTarget, value.type, key, value.options);
			});
		},
		[removeGlobalListener],
		subSlot(slot, 'removeAll'),
	);

	useEffect(
		() => {
			return removeAllGlobalListeners;
		},
		[removeAllGlobalListeners],
		subSlot(slot, 'teardown'),
	);

	return { addGlobalListener, removeGlobalListener, removeAllGlobalListeners } as GlobalListeners;
}
