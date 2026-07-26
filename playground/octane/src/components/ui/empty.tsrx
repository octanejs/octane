// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/empty.tsx. Note: upstream renders
// EmptyMedia with data-slot="empty-icon" and EmptyDescription as a <div>
// (typed as "p") — both preserved as-is.
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

type DivProps = { className?: string } & Record<string, unknown>;

export function Empty({ className, ...props }: DivProps) @{
	<div
		data-slot="empty"
		className={cn(
			'cn-empty flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance',
			className,
		)}
		{...props}
	/>
}

export function EmptyHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-header"
		className={cn('cn-empty-header flex max-w-sm flex-col items-center', className)}
		{...props}
	/>
}

export const emptyMediaVariants = cva(
	'cn-empty-media flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'cn-empty-media-default',
				icon: 'cn-empty-media-icon',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface EmptyMediaProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof emptyMediaVariants>['variant'];
}

export function EmptyMedia({ className, variant = 'default', ...props }: EmptyMediaProps) @{
	<div
		data-slot="empty-icon"
		data-variant={variant}
		className={cn(emptyMediaVariants({ variant, className }))}
		{...props}
	/>
}

export function EmptyTitle({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-title"
		className={cn('cn-empty-title cn-font-heading', className)}
		{...props}
	/>
}

export function EmptyDescription({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-description"
		className={cn(
			'cn-empty-description text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
			className,
		)}
		{...props}
	/>
}

export function EmptyContent({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-content"
		className={cn(
			'cn-empty-content flex w-full max-w-sm min-w-0 flex-col items-center text-balance',
			className,
		)}
		{...props}
	/>
}
