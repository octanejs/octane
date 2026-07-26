// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/scroll-area.tsx (the `"use client"`
// directive is dropped — octane has no RSC axis).
//
// ScrollArea forwards opaque compiled children into the Viewport next to
// sibling descriptors (ScrollBar, Corner), so it is composed with
// createElement (the cmdk Command.Dialog precedent — see breadcrumb.tsrx's
// comment).
import { ScrollArea as ScrollAreaPrimitive } from '@octanejs/radix';
import { createElement, type OctaneNode } from 'octane';

import { cn } from '@/lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function ScrollArea({ className, children, ...props }: Props & { children?: OctaneNode }) {
	return createElement(
		ScrollAreaPrimitive.Root,
		{
			'data-slot': 'scroll-area',
			className: cn('cn-scroll-area relative', className),
			...props,
		},
		createElement(
			ScrollAreaPrimitive.Viewport,
			{
				'data-slot': 'scroll-area-viewport',
				className: 'cn-scroll-area-viewport size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1',
			},
			children,
		),
		createElement(ScrollBar, {}),
		createElement(ScrollAreaPrimitive.Corner, {}),
	);
}

export interface ScrollBarProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'vertical' | 'horizontal';
}

export function ScrollBar({ className, orientation = 'vertical', ...props }: ScrollBarProps) @{
	<ScrollAreaPrimitive.ScrollAreaScrollbar
		data-slot="scroll-area-scrollbar"
		data-orientation={orientation}
		orientation={orientation}
		className={cn(
			'cn-scroll-area-scrollbar flex touch-none p-px transition-colors select-none',
			className,
		)}
		{...props}
	>
		<ScrollAreaPrimitive.ScrollAreaThumb
			data-slot="scroll-area-thumb"
			className="cn-scroll-area-thumb relative flex-1 bg-border"
		/>
	</ScrollAreaPrimitive.ScrollAreaScrollbar>
}
