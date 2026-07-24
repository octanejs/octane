// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/alert.tsx.
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

export const alertVariants = cva('cn-alert group/alert relative w-full', {
	variants: {
		variant: {
			default: 'cn-alert-variant-default',
			destructive: 'cn-alert-variant-destructive',
		},
	},
	defaultVariants: {
		variant: 'default',
	},
});

export interface AlertProps extends Record<string, unknown> {
	className?: string;
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
			'cn-alert-title [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
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
			'cn-alert-description [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
			className,
		)}
		{...props}
	/>
}

export function AlertAction({ className, ...props }: { className?: string } & Record<
	string,
	unknown
>) @{
	<div data-slot="alert-action" className={cn('cn-alert-action', className)} {...props} />
}
