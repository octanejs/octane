// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/item.tsx. asChild follows the radix Slot
// descriptor contract (see badge.tsrx).
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@octanejs/radix';

import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

type DivProps = { className?: string } & Record<string, unknown>;

export function ItemGroup({ className, ...props }: DivProps) @{
	<div
		role="list"
		data-slot="item-group"
		className={cn('cn-item-group group/item-group flex w-full flex-col', className)}
		{...props}
	/>
}

export function ItemSeparator({ className, ...props }: DivProps) @{
	<Separator
		data-slot="item-separator"
		orientation="horizontal"
		className={cn('cn-item-separator', className)}
		{...props}
	/>
}

export const itemVariants = cva(
	'cn-item group/item flex w-full flex-wrap items-center transition-colors duration-100 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [a]:transition-colors',
	{
		variants: {
			variant: {
				default: 'cn-item-variant-default',
				outline: 'cn-item-variant-outline',
				muted: 'cn-item-variant-muted',
			},
			size: {
				default: 'cn-item-size-default',
				sm: 'cn-item-size-sm',
				xs: 'cn-item-size-xs',
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
	variant?: VariantProps<typeof itemVariants>['variant'];
	size?: VariantProps<typeof itemVariants>['size'];
	asChild?: boolean;
}

export function Item({
	className,
	variant = 'default',
	size = 'default',
	asChild = false,
	...props
}: ItemProps) @{
	@if (asChild) {
		<Slot
			data-slot="item"
			data-variant={variant}
			data-size={size}
			className={cn(itemVariants({ variant, size, className }))}
			{...props}
		/>
	} @else {
		<div
			data-slot="item"
			data-variant={variant}
			data-size={size}
			className={cn(itemVariants({ variant, size, className }))}
			{...props}
		/>
	}
}

export const itemMediaVariants = cva(
	'cn-item-media flex shrink-0 items-center justify-center [&_svg]:pointer-events-none',
	{
		variants: {
			variant: {
				default: 'cn-item-media-variant-default',
				icon: 'cn-item-media-variant-icon',
				image: 'cn-item-media-variant-image',
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
			'cn-item-content flex flex-1 flex-col [&+[data-slot=item-content]]:flex-none',
			className,
		)}
		{...props}
	/>
}

export function ItemTitle({ className, ...props }: DivProps) @{
	<div
		data-slot="item-title"
		className={cn('cn-item-title line-clamp-1 flex w-fit items-center', className)}
		{...props}
	/>
}

export function ItemDescription({ className, ...props }: DivProps) @{
	<p
		data-slot="item-description"
		className={cn(
			'cn-item-description line-clamp-2 font-normal [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
			className,
		)}
		{...props}
	/>
}

export function ItemActions({ className, ...props }: DivProps) @{
	<div
		data-slot="item-actions"
		className={cn('cn-item-actions flex items-center', className)}
		{...props}
	/>
}

export function ItemHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="item-header"
		className={cn('cn-item-header flex basis-full items-center justify-between', className)}
		{...props}
	/>
}

export function ItemFooter({ className, ...props }: DivProps) @{
	<div
		data-slot="item-footer"
		className={cn('cn-item-footer flex basis-full items-center justify-between', className)}
		{...props}
	/>
}
