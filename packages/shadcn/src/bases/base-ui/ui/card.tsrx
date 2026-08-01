// Base UI base card — presentational, no headless primitive in any base.
//
// UNVERIFIED PROVENANCE: derived from this package's React Aria base rather than transcribed
// from upstream's `bases/base-ui/ui/card.tsx`, which was not available at port time.
// Diff the class strings against the upstream source before treating this as ported.
import { cn } from '../../../lib/utils';
import type { DivProps } from '../../../lib/types';

export interface CardProps extends DivProps {
	size?: 'default' | 'sm';
}

export function Card({ className, size = 'default', ...props }: CardProps) @{
	<div
		data-slot="card"
		data-size={size}
		className={cn(
			'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
			className,
		)}
		{...props}
	/>
}

export function CardHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="card-header"
		className={cn(
			'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
			className,
		)}
		{...props}
	/>
}

export function CardTitle({ className, ...props }: DivProps) @{
	<div
		data-slot="card-title"
		className={cn(
			'text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
			className,
		)}
		{...props}
	/>
}

export function CardDescription({ className, ...props }: DivProps) @{
	<div
		data-slot="card-description"
		className={cn('text-sm text-muted-foreground', className)}
		{...props}
	/>
}

export function CardAction({ className, ...props }: DivProps) @{
	<div
		data-slot="card-action"
		className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
		{...props}
	/>
}

export function CardContent({ className, ...props }: DivProps) @{
	<div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />
}

export function CardFooter({ className, ...props }: DivProps) @{
	<div
		data-slot="card-footer"
		className={cn(
			'flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)',
			className,
		)}
		{...props}
	/>
}
