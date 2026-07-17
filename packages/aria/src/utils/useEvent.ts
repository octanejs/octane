// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useEvent.ts).
import type { RefObject } from '@react-types/shared';
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useEffectEvent } from './useEffectEvent';

export function useEvent<K extends keyof GlobalEventHandlersEventMap>(
	ref: RefObject<EventTarget | null>,
	event: K | (string & {}),
	handler?: (this: Document, ev: GlobalEventHandlersEventMap[K]) => any,
	options?: boolean | AddEventListenerOptions,
): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg
// (the optional `options` user arg, when present, comes before it).
export function useEvent<K extends keyof GlobalEventHandlersEventMap>(
	ref: RefObject<EventTarget | null>,
	event: K | (string & {}),
	handler: ((this: Document, ev: GlobalEventHandlersEventMap[K]) => any) | undefined,
	slot: symbol | undefined,
): void;
export function useEvent<K extends keyof GlobalEventHandlersEventMap>(
	ref: RefObject<EventTarget | null>,
	event: K | (string & {}),
	handler: ((this: Document, ev: GlobalEventHandlersEventMap[K]) => any) | undefined,
	options: boolean | AddEventListenerOptions | undefined,
	slot: symbol | undefined,
): void;
export function useEvent(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useEvent');
	const ref = user[0] as { current: EventTarget | null };
	const event = user[1] as string;
	const handler = user[2] as EventListener | undefined;
	const options = user[3] as boolean | AddEventListenerOptions | undefined;

	let handleEvent = useEffectEvent(handler, subSlot(slot, 'handler'));
	let isDisabled = handler == null;

	useEffect(
		() => {
			if (isDisabled || !ref.current) {
				return;
			}

			let element = ref.current;
			element.addEventListener(event, handleEvent as EventListener, options);
			return () => {
				element.removeEventListener(event, handleEvent as EventListener, options);
			};
		},
		[ref, event, options, isDisabled],
		subSlot(slot, 'listen'),
	);
}
