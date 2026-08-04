// Base UI base item — class strings from the maintainer-supplied radix source, verbatim. Ten of the
// eleven parts are plain host elements, and the eleventh (`ItemSeparator`) delegates to this base's
// own Separator, so it picks up Base UI's `aria-orientation` dialect automatically.
//
// NO DIALECT RISK IN THE VARIANTS, which is worth stating because they look like the ones that
// caught toggle and slider: `data-[size=…]` and `data-[variant=…]` here read attributes THIS
// component writes itself, not state emitted by a primitive. Nothing underneath emits anything.
//
// `Item` SHIPS WITHOUT `asChild`, the same call as badge and breadcrumb in this base. Radix swaps in
// `Slot`; React Aria takes a `render` function; Base UI has no Slot, and item has no primitive to
// borrow a `render` prop from, so nothing here settles the spelling upstream uses. Adding it later
// is additive; shipping the wrong shape is breaking. A consumer needing a different element can
// apply `itemVariants({ variant, size })` directly, which is what the class export is for.
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../../lib/utils';
import { Separator } from './separator.tsrx';

type DivProps = { className?: string } & Record<string, unknown>;

export function ItemGroup({ className, ...props }: DivProps) @{
	<div
		role="list"
		data-slot="item-group"
		className={cn(
			'group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2',
			className,
		)}
		{...props}
	/>
}

export function ItemSeparator({ className, ...props }: DivProps) @{
	<Separator
		data-slot="item-separator"
		orientation="horizontal"
		className={cn('my-2', className)}
		{...props}
	/>
}

export const itemVariants = cva(
	'group/item flex w-full flex-wrap items-center rounded-lg border text-sm transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors [a]:hover:bg-muted',
	{
		variants: {
			variant: {
				default: 'border-transparent',
				outline: 'border-border',
				muted: 'border-transparent bg-muted/50',
			},
			size: {
				default: 'gap-2.5 px-3 py-2.5',
				sm: 'gap-2.5 px-3 py-2.5',
				xs: 'gap-2 px-2.5 py-2 in-data-[slot=dropdown-menu-content]:p-0',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export interface ItemProps extends Record<string, unknown> {
	className?: string;
	/** Not supported in this base — see the header. Declared so it fails to compile, not silently. */
	asChild?: never;
	variant?: VariantProps<typeof itemVariants>['variant'];
	size?: VariantProps<typeof itemVariants>['size'];
}

export function Item({ className, variant = 'default', size = 'default', ...props }: ItemProps) @{
	<div
		data-slot="item"
		data-variant={variant}
		data-size={size}
		className={cn(itemVariants({ variant, size, className }))}
		{...props}
	/>
}

export const itemMediaVariants = cva(
	'flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				icon: '[&_svg:not([class*=\'size-\'])]:size-4',
				image: 'size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface ItemMediaProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof itemMediaVariants>['variant'];
}

export function ItemMedia({ className, variant = 'default', ...props }: ItemMediaProps) @{
	<div
		data-slot="item-media"
		data-variant={variant}
		className={cn(itemMediaVariants({ variant, className }))}
		{...props}
	/>
}

export function ItemContent({ className, ...props }: DivProps) @{
	<div
		data-slot="item-content"
		className={cn(
			'flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none',
			className,
		)}
		{...props}
	/>
}

export function ItemTitle({ className, ...props }: DivProps) @{
	<div
		data-slot="item-title"
		className={cn(
			'line-clamp-1 flex w-fit items-center gap-2 text-sm leading-snug font-medium underline-offset-4',
			className,
		)}
		{...props}
	/>
}

export function ItemDescription({ className, ...props }: DivProps) @{
	<p
		data-slot="item-description"
		className={cn(
			'line-clamp-2 text-left text-sm leading-normal font-normal text-muted-foreground group-data-[size=xs]/item:text-xs [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
			className,
		)}
		{...props}
	/>
}

export function ItemActions({ className, ...props }: DivProps) @{
	<div data-slot="item-actions" className={cn('flex items-center gap-2', className)} {...props} />
}

export function ItemHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="item-header"
		className={cn('flex basis-full items-center justify-between gap-2', className)}
		{...props}
	/>
}

export function ItemFooter({ className, ...props }: DivProps) @{
	<div
		data-slot="item-footer"
		className={cn('flex basis-full items-center justify-between gap-2', className)}
		{...props}
	/>
}
