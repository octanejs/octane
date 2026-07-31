// Default-Tailwind alert flavor (package canonical) — user-supplied styling,
// cva strings verbatim. Pure template JSX (no consumer-children interleave).
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../../lib/utils';
import type { DivProps } from '../../../lib/types';

export const alertVariants = cva(
	'group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*=\'size-\'])]:size-4',
	{
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				destructive: 'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 *:[svg]:text-current',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface AlertProps extends DivProps {
	variant?: VariantProps<typeof alertVariants>['variant'];
}

export function Alert({ className, variant, ...props }: AlertProps) @{
	<div
		data-slot="alert"
		role="alert"
		className={cn(alertVariants({ variant }), className)}
		{...props}
	/>
}

export function AlertTitle({ className, ...props }: { className?: string } & Record<
	string,
	unknown
>) @{
	<div
		data-slot="alert-title"
		className={cn(
			'font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
			className,
		)}
		{...props}
	/>
}

export function AlertDescription({ className, ...props }: { className?: string } & Record<
	string,
	unknown
>) @{
	<div
		data-slot="alert-description"
		className={cn(
			'text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
			className,
		)}
		{...props}
	/>
}

export function AlertAction({ className, ...props }: { className?: string } & Record<
	string,
	unknown
>) @{
	<div data-slot="alert-action" className={cn('absolute top-2 right-2', className)} {...props} />
}
