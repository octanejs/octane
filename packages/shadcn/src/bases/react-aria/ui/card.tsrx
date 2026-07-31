import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function Card({ className, size = 'default', ...props }: HostProps<'div'> & {
	size?: 'default' | 'sm';
}) {
	return <div
		data-slot="card"
		data-size={size}
		className={cn(
			'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
			className,
		)}
		{...props}
	/>;
}

export function CardHeader({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="card-header"
		className={cn(
			'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
			className,
		)}
		{...props}
	/>;
}

export function CardTitle({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="card-title"
		className={cn(
			'text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
			className,
		)}
		{...props}
	/>;
}

export function CardDescription({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="card-description"
		className={cn('text-sm text-muted-foreground', className)}
		{...props}
	/>;
}

export function CardAction({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="card-action"
		className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
		{...props}
	/>;
}

export function CardContent({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="card-content"
		className={cn('px-(--card-spacing)', className)}
		{...props}
	/>;
}

export function CardFooter({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="card-footer"
		className={cn(
			'flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)',
			className,
		)}
		{...props}
	/>;
}
