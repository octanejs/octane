// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useFormReset.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit `[ref]` effect dep array is preserved exactly. The listener is
// wired with native `addEventListener('reset')` exactly like upstream.
import { useEffect } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { useEffectEvent } from './useEffectEvent';

type RefObject<T> = { current: T };

export function useFormReset<T>(
	ref: RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null> | undefined,
	initialValue: T,
	onReset: (value: T) => void,
): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFormReset<T>(
	ref: RefObject<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null> | undefined,
	initialValue: T,
	onReset: (value: T) => void,
	slot: symbol | undefined,
): void;
export function useFormReset(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFormReset');
	const ref = user[0] as
		| { current: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null }
		| undefined;
	const initialValue = user[1];
	const onReset = user[2] as (value: any) => void;

	let handleReset = useEffectEvent(
		(e: Event) => {
			if (onReset && !e.defaultPrevented) {
				onReset(initialValue);
			}
		},
		subSlot(slot, 'handler'),
	);

	useEffect(
		() => {
			let form = ref?.current?.form;

			form?.addEventListener('reset', handleReset);
			return () => {
				form?.removeEventListener('reset', handleReset);
			};
		},
		[ref],
		subSlot(slot, 'listen'),
	);
}
