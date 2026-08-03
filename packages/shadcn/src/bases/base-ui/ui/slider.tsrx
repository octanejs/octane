// Base UI base slider — runs on @octanejs/base-ui's Slider.
//
// THE PART TREE IS NOT THE RADIX ONE. Verified by rendering the primitive:
//
//     radix     Root > Track > Range,  Thumb as a SIBLING of Track
//     Base UI   Root > Control > Track > Indicator + Thumb   (thumbs INSIDE the track)
//
// Two consequences the class strings have to follow:
//
//   1. ROOT IS NOT THE INTERACTIVE BOX. Base UI's Root renders a bare `role="group"` wrapper and
//      `Control` is the element that spans the rail and takes the pointer. So the radix base's
//      `relative flex w-full touch-none items-center select-none` layout moves off Root and onto
//      Control; leaving it on Root would style a wrapper that does not contain the pointer target.
//
//   2. THE INDICATOR POSITIONS ITSELF. Base UI emits `position: relative; height: inherit;
//      inset-inline-start: …; width: …%` inline on the Indicator, where radix leaves the fill to
//      the consumer and its base therefore ships `absolute`. Carrying `absolute` across would
//      fight the primitive's own inline `position: relative` — so it is dropped and only the
//      paint (`bg-primary`) is kept.
//
// `data-orientation` is the shared dialect here: unlike separator, Base UI's slider does emit it
// on Root/Control/Track/Indicator/Thumb, so the radix base's `data-[orientation=…]` variants
// carry over unchanged. That was checked against the rendered output, not assumed.
//
// Thumbs are composed with createElement for the same reason as the radix base: one per entry of
// `_values`, and mapped descriptors are octane's channel for computed children.
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source; the redistribution across Root/Control and the
// dropped `absolute` are the adaptations described above.
import { createElement, useMemo } from 'octane';
import { Slider as SliderPrimitive } from '@octanejs/base-ui/slider';

import { cn } from '../../../lib/utils';

export interface SliderProps extends Record<string, unknown> {
	className?: string;
	defaultValue?: number | number[];
	value?: number | number[];
	min?: number;
	max?: number;
}

export function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: SliderProps) {
	const _values = useMemo(
		() => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
		[value, defaultValue, min, max],
	);

	return createElement(
		SliderPrimitive.Root,
		{
			'data-slot': 'slider',
			defaultValue,
			value,
			min,
			max,
			className: cn('data-[disabled]:opacity-50', className),
			...props,
		},
		createElement(
			SliderPrimitive.Control,
			{
				'data-slot': 'slider-control',
				className: 'relative flex w-full touch-none items-center select-none data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
			},
			createElement(
				SliderPrimitive.Track,
				{
					'data-slot': 'slider-track',
					className: 'relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
				},
				createElement(SliderPrimitive.Indicator, {
					'data-slot': 'slider-range',
					className: 'bg-primary',
				}),
				...Array.from(
					{ length: _values.length },
					(_, index) => createElement(SliderPrimitive.Thumb, {
						'data-slot': 'slider-thumb',
						key: index,
						className: 'block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
					}),
				),
			),
		),
	);
}
