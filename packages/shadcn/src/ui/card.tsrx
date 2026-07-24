// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/card.tsx.
import { cn } from '../lib/utils';

type DivProps = { className?: string } & Record<string, unknown>;

export interface CardProps extends Record<string, unknown> {
	className?: string;
	size?: 'default' | 'sm';
}

export function Card({ className, size = 'default', ...props }: CardProps) @{
	<div
		data-slot="card"
		data-size={size}
		className={cn('cn-card group/card flex flex-col', className)}
		{...props}
	/>
}

export function CardHeader({ className, ...props }: DivProps) @{
	<div
		data-slot="card-header"
		className={cn(
			'cn-card-header group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]',
			className,
		)}
		{...props}
	/>
}

export function CardTitle({ className, ...props }: DivProps) @{
	<div
		data-slot="card-title"
		className={cn('cn-card-title cn-font-heading', className)}
		{...props}
	/>
}

export function CardDescription({ className, ...props }: DivProps) @{
	<div data-slot="card-description" className={cn('cn-card-description', className)} {...props} />
}

export function CardAction({ className, ...props }: DivProps) @{
	<div
		data-slot="card-action"
		className={cn(
			'cn-card-action col-start-2 row-span-2 row-start-1 self-start justify-self-end',
			className,
		)}
		{...props}
	/>
}

export function CardContent({ className, ...props }: DivProps) @{
	<div data-slot="card-content" className={cn('cn-card-content', className)} {...props} />
}

export function CardFooter({ className, ...props }: DivProps) @{
	<div
		data-slot="card-footer"
		className={cn('cn-card-footer flex items-center', className)}
		{...props}
	/>
}
