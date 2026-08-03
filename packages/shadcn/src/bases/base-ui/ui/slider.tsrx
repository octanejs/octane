// Base UI base slider — TRANSCRIBED from upstream's `bases/base-ui/ui/slider.tsx`
// (maintainer-supplied). Structure, part tree and class strings follow that source.
//
// THE PART TREE IS NOT THE RADIX ONE:
//
//     radix     Root >           Track > Range,       Thumb a SIBLING of Track (under Root)
//     Base UI   Root > Control > Track > Indicator,   Thumb a SIBLING of Track (under Control)
//
// The thumb sits OUTSIDE the track in both. That matters: the track carries `overflow-hidden` —
// which is what gives the fill its rounded ends — and is only `h-1` tall, so a round thumb nested
// inside it is clipped to a 4px sliver that reads as a missing thumb. Base UI positions the thumb
// from slider context rather than from its DOM parent (`inset-inline-start: <pct>` plus a
// centering `translate`), so Control is the box those percentages resolve against.
//
// ONE DEPARTURE FROM THE SOURCE, AND IT IS DELIBERATE: upstream writes its orientation variants as
// `data-horizontal:` / `data-vertical:`. No primitive in @octanejs/base-ui emits those attributes —
// this one publishes `data-orientation="horizontal" | "vertical"` on Root, Control, Track,
// Indicator and Thumb (verified by rendering it), so the variants are written as
// `data-[orientation=…]:` instead. Copied verbatim, upstream's spelling would match nothing and the
// track would render with no height at all: an invisible rail. Whether the primitive should be
// emitting the newer attribute names is a question about @octanejs/base-ui, not about this file.
//
// `thumbAlignment="edge"` is forwarded as upstream does: it insets the thumb so the two extremes
// sit flush with the ends of the track instead of overhanging them.
//
// Thumbs are composed with createElement for the same reason as the radix base: one per entry of
// `_values`, and mapped descriptors are octane's channel for computed children.
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
	// This drives HOW MANY THUMBS get rendered, so a value shape it fails to recognise is a visible
	// bug rather than a type nicety.
	//
	// DEPARTS FROM THE TRANSCRIBED SOURCE, deliberately. Upstream only tests `Array.isArray` and
	// otherwise falls back to `[min, max]` — but Base UI's Slider accepts a SCALAR for a
	// single-value slider, and upstream types these props as `SliderPrimitive.Root.Props`, which
	// permits one. So `defaultValue={30}` renders two thumbs against a one-value slider: the range
	// fallback fires, and the second thumb has no value behind it.
	const _values = useMemo(() => {
		// A controlled `value` wins when present; `??` rather than `||` so a legitimate 0 counts.
		const provided = value ?? defaultValue;
		if (Array.isArray(provided)) {
			return provided;
		}
		if (typeof provided === 'number') {
			return [provided];
		}
		// Neither given: upstream's range-across-the-track default, kept as-is in both bases.
		return [min, max];
	}, [value, defaultValue, min, max]);

	return createElement(
		SliderPrimitive.Root,
		{
			className: cn(
				'data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full',
				className,
			),
			'data-slot': 'slider',
			defaultValue,
			value,
			min,
			max,
			thumbAlignment: 'edge',
			...props,
		},
		createElement(
			SliderPrimitive.Control,
			{
				className: 'relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
			},
			createElement(
				SliderPrimitive.Track,
				{
					'data-slot': 'slider-track',
					className: 'relative grow overflow-hidden rounded-full bg-muted select-none data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1',
				},
				createElement(SliderPrimitive.Indicator, {
					'data-slot': 'slider-range',
					className: 'bg-primary select-none data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
				}),
			),
			...Array.from(
				{ length: _values.length },
				(_, index) => createElement(SliderPrimitive.Thumb, {
					'data-slot': 'slider-thumb',
					key: index,
					className: 'relative block size-3 shrink-0 rounded-full border border-ring bg-white ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 disabled:pointer-events-none disabled:opacity-50',
				}),
			),
		),
	);
}
