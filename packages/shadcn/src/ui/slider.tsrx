// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/slider.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
//
// The Track/Range/Thumb tree is composed with createElement: upstream renders
// one Thumb per entry of `_values` via an array map, and mapped/prop-position
// descriptors are the octane channel for computed children (see
// breadcrumb.tsrx's comment on opaque compiled children).
import { createElement, useMemo } from 'octane';
import { Slider as SliderPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export interface SliderProps extends Record<string, unknown> {
	className?: string;
	defaultValue?: number[];
	value?: number[];
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
		() => Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max],
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
			className: cn(
				'cn-slider relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col',
				className,
			),
			...props,
		},
		createElement(
			SliderPrimitive.Track,
			{
				'data-slot': 'slider-track',
				className: 'cn-slider-track relative grow overflow-hidden data-horizontal:w-full data-vertical:h-full',
			},
			createElement(SliderPrimitive.Range, {
				'data-slot': 'slider-range',
				className: 'cn-slider-range absolute select-none data-horizontal:h-full data-vertical:w-full',
			}),
		),
		...Array.from(
			{ length: _values.length },
			(_, index) => createElement(SliderPrimitive.Thumb, {
				'data-slot': 'slider-thumb',
				key: index,
				className: 'cn-slider-thumb block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50',
			}),
		),
	);
}
