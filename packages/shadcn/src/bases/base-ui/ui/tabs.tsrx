// Base UI base tabs — TRANSCRIBED from upstream's `bases/base-ui/ui/tabs.tsx` (maintainer-supplied),
// class strings verbatim. Runs on @octanejs/base-ui's `Tabs`, which was ported for this family:
// Root / List / Tab / Panel.
//
// ONE DEPARTURE FROM THE SOURCE, FORCED BY A VERSION SKEW. Upstream writes its orientation variants
// as `data-horizontal:` / `data-vertical:` — bare attributes. The pinned @octanejs/base-ui (v1.6.0)
// converts the orientation state to `data-orientation="horizontal" | "vertical"` instead, so those
// utilities would match nothing: the root would never switch to a column, and every
// `group-data-horizontal/tabs:` and `group-data-vertical/tabs:` selector on the trigger would be
// dead. They are written as `data-[orientation=…]:` here.
//
// This is the SAME skew the slider hit, and it is not a porting mistake in either layer — shadcn's
// Base UI sources target a newer Base UI than the pin this package binds. The primitive stays
// faithful to its pin; the adaptation belongs here. When the binding moves to a release that emits
// the bare attributes, these revert to upstream's spelling.
//
// `data-active` on the trigger needs no such treatment: the pin emits it exactly as upstream's
// classes expect (verified by rendering).
//
// Octane adaptations: no `"use client"`.
import { cva, type VariantProps } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from '@octanejs/base-ui/tabs';

import { cn } from '../../../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export interface TabsProps extends Props {
	orientation?: 'horizontal' | 'vertical';
}

export function Tabs({ className, orientation = 'horizontal', ...props }: TabsProps) @{
	<TabsPrimitive.Root
		data-slot="tabs"
		data-orientation={orientation}
		orientation={orientation}
		className={cn('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', className)}
		{...props}
	/>
}

export const tabsListVariants = cva(
	'group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none',
	{
		variants: {
			variant: {
				default: 'bg-muted',
				line: 'gap-1 bg-transparent',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface TabsListProps extends Props {
	variant?: VariantProps<typeof tabsListVariants>['variant'];
}

export function TabsList({ className, variant = 'default', ...props }: TabsListProps) @{
	<TabsPrimitive.List
		data-slot="tabs-list"
		data-variant={variant}
		className={cn(tabsListVariants({ variant }), className)}
		{...props}
	/>
}

export function TabsTrigger({ className, ...props }: Props) @{
	<TabsPrimitive.Tab
		data-slot="tabs-trigger"
		className={cn(
			'relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
			'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
			'data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground',
			'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
			className,
		)}
		{...props}
	/>
}

export function TabsContent({ className, ...props }: Props) @{
	<TabsPrimitive.Panel
		data-slot="tabs-content"
		className={cn('flex-1 text-sm outline-none', className)}
		{...props}
	/>
}
