// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/meter/useMeter.ts).
import type { DOMAttributes } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import {
	AriaProgressBarBaseProps,
	ProgressBarBaseProps,
	useProgressBar,
} from '../progress/useProgressBar';

export type MeterProps = ProgressBarBaseProps;
export interface AriaMeterProps extends AriaProgressBarBaseProps {}

export interface MeterAria {
	/** Props for the meter container element. */
	meterProps: DOMAttributes;
	/** Props for the meter's visual label (if any). */
	labelProps: DOMAttributes;
}

export function useMeter(props: AriaMeterProps): MeterAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMeter(props: AriaMeterProps, slot: symbol | undefined): MeterAria;
export function useMeter(...args: any[]): MeterAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMeter');
	const props = user[0] as AriaMeterProps;

	let { progressBarProps, labelProps } = useProgressBar(props, subSlot(slot, 'progress'));

	return {
		meterProps: {
			...progressBarProps,
			// Use the meter role if available, but fall back to progressbar if not
			// Chrome currently falls back from meter automatically, and Firefox
			// does not support meter at all. Safari 13+ seems to support meter properly.
			// https://bugs.chromium.org/p/chromium/issues/detail?id=944542
			// https://bugzilla.mozilla.org/show_bug.cgi?id=1460378
			role: 'meter progressbar',
		},
		labelProps,
	};
}
