// ScrollArea — maintainer-supplied default-Tailwind flavor, class strings
// verbatim. Octane adaptations: "use client" dropped, radix-ui →
// @octanejs/radix; ScrollArea interleaves consumer children with sibling
// descriptors (ScrollBar, Corner), so it uses the {props.children} lowering.
import type { OctaneNode } from 'octane';
import { ScrollArea as ScrollAreaPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

type Props = { className?: string; children?: OctaneNode } & Record<string, unknown>;

export function ScrollArea(props: Props) @{
	const { className, children: _children, ...rest } = props;

	<ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn('relative', className)} {...rest}>
		<ScrollAreaPrimitive.Viewport
			data-slot="scroll-area-viewport"
			className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
		>{props.children}</ScrollAreaPrimitive.Viewport>
		<ScrollBar />
		<ScrollAreaPrimitive.Corner />
	</ScrollAreaPrimitive.Root>
}

export function ScrollBar({ className, orientation = 'vertical', ...props }: Props & {
	orientation?: 'vertical' | 'horizontal';
}) @{
	<ScrollAreaPrimitive.ScrollAreaScrollbar
		data-slot="scroll-area-scrollbar"
		data-orientation={orientation}
		orientation={orientation}
		className={cn(
			'flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent',
			className,
		)}
		{...props}
	>
		<ScrollAreaPrimitive.ScrollAreaThumb
			data-slot="scroll-area-thumb"
			className="relative flex-1 rounded-full bg-border"
		/>
	</ScrollAreaPrimitive.ScrollAreaScrollbar>
}
