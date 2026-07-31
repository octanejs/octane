// Empty — maintainer-supplied default-Tailwind flavor, class strings verbatim.
// Upstream renders EmptyMedia with data-slot="empty-icon" and EmptyDescription
// as a <div> (typed as "p") — both preserved as-is.
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../../lib/utils';

type DivProps = { className?: string } & Record<string, unknown>;

export function Empty({ className, ...props }: DivProps) @{
	<div
		data-slot="empty"
		className={cn(
			'flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed p-6 text-center text-balance',
			className,
		)}
		{...props}
	/>
}

export function EmptyHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-header"
		className={cn('flex max-w-sm flex-col items-center gap-2', className)}
		{...props}
	/>
}

export const emptyMediaVariants = cva(
	'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				icon: 'flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*=\'size-\'])]:size-4',
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
		className={cn('cn-font-heading text-sm font-medium tracking-tight', className)}
		{...props}
	/>
}

export function EmptyDescription({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-description"
		className={cn(
			'text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary',
			className,
		)}
		{...props}
	/>
}

export function EmptyContent({ className, ...props }: DivProps) @{
	<div
		data-slot="empty-content"
		className={cn(
			'flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance',
			className,
		)}
		{...props}
	/>
}
