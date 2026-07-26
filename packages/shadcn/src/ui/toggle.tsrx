// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/toggle.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
import { cva, type VariantProps } from 'class-variance-authority';
import { Toggle as TogglePrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export const toggleVariants = cva(
	'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-muted hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
	{
		variants: {
			variant: {
				default: 'bg-transparent',
				outline: 'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground',
			},
			size: {
				default: 'h-9 min-w-9 px-2',
				sm: 'h-8 min-w-8 px-1.5',
				lg: 'h-10 min-w-10 px-2.5',
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
