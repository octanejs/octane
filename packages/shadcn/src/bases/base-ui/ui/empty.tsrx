// Base UI base empty — presentational, no headless primitive in any base.
//
// UNVERIFIED PROVENANCE: derived from this package's React Aria base rather than transcribed
// from upstream's `bases/base-ui/ui/empty.tsx`, which was not available at port time.
// Diff the class strings against the upstream source before treating this as ported.
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../../lib/utils';
import type { DivProps, HostProps } from '../../../lib/types';

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

export interface EmptyMediaProps extends DivProps {
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
		className={cn('text-sm font-medium tracking-tight', className)}
		{...props}
	/>
}

// Upstream types this part as a `<p>` while rendering a `<div>`; the prop type is transcribed
// as-authored rather than "corrected", so the surface matches upstream exactly.
export function EmptyDescription({ className, ...props }: HostProps<'p'>) @{
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
