// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/slider/utils.ts).
// octane adaptations: `SliderState` type comes from the ported stately slider hook.
import type { SliderState } from '../stately/slider/useSliderState';

interface SliderData {
	id: string;
	'aria-describedby'?: string;
	'aria-details'?: string;
}

export const sliderData: WeakMap<SliderState, SliderData> = new WeakMap<SliderState, SliderData>();

export function getSliderThumbId(state: SliderState, index: number): string {
	let data = sliderData.get(state);
	if (!data) {
		throw new Error('Unknown slider state');
	}

	return `${data.id}-${index}`;
}
