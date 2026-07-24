// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/button.tsx. Class strings, cva maps, and
// data-slot/data-variant/data-size are preserved byte-for-byte.
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@octanejs/radix';

import { cn } from '@/lib/utils';

export const buttonVariants = cva(
	'cn-button group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap transition-all outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'cn-button-variant-default',
				outline: 'cn-button-variant-outline',
				secondary: 'cn-button-variant-secondary',
				ghost: 'cn-button-variant-ghost',
				destructive: 'cn-button-variant-destructive',
				link: 'cn-button-variant-link',
			},
			size: {
				default: 'cn-button-size-default',
				xs: 'cn-button-size-xs',
				sm: 'cn-button-size-sm',
				lg: 'cn-button-size-lg',
				icon: 'cn-button-size-icon',
				'icon-xs': 'cn-button-size-icon-xs',
				'icon-sm': 'cn-button-size-icon-sm',
				'icon-lg': 'cn-button-size-icon-lg',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export interface ButtonProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof buttonVariants>['variant'];
	size?: VariantProps<typeof buttonVariants>['size'];
	// OCTANE DIVERGENCE: asChild composes element descriptors (createElement),
	// not opaque compiled .tsrx children — the documented radix Slot contract.
	asChild?: boolean;
	ref?: unknown;
}

export function Button({
	className,
	variant = 'default',
	size = 'default',
	asChild = false,
	...props
}: ButtonProps) @{
	@if (asChild) {
		<Slot
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	} @else {
		<button
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	}
}
