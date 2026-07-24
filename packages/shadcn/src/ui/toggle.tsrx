// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/toggle.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export const toggleVariants = cva(
	'cn-toggle group/toggle inline-flex items-center justify-center whitespace-nowrap outline-none hover:bg-muted focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
	{
		variants: {
			variant: {
				default: 'cn-toggle-variant-default',
				outline: 'cn-toggle-variant-outline',
			},
			size: {
				default: 'cn-toggle-size-default',
				sm: 'cn-toggle-size-sm',
				lg: 'cn-toggle-size-lg',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export interface ToggleProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof toggleVariants>['variant'];
	size?: VariantProps<typeof toggleVariants>['size'];
}

export function Toggle({
	className,
	variant = 'default',
	size = 'default',
	...props
}: ToggleProps) @{
	<TogglePrimitive.Root
		data-slot="toggle"
		className={cn(toggleVariants({ variant, size, className }))}
		{...props}
	/>
}
