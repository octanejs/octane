// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/badge.tsx.
//
// The cva variant map, class strings, and data-slot/data-variant attributes are
// preserved byte-for-byte — they are the public styling contract the style CSS
// and consumer selectors target. Renderer adaptations only: octane host JSX,
// ref-as-prop, and `asChild` through @octanejs/radix's Slot.
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@octanejs/radix';

import { cn } from '@/lib/utils';

export const badgeVariants = cva(
	'cn-badge group/badge inline-flex w-fit shrink-0 items-center justify-center overflow-hidden whitespace-nowrap focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
	{
		variants: {
			variant: {
				default: 'cn-badge-variant-default',
				secondary: 'cn-badge-variant-secondary',
				destructive: 'cn-badge-variant-destructive',
				outline: 'cn-badge-variant-outline',
				ghost: 'cn-badge-variant-ghost',
				link: 'cn-badge-variant-link',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface BadgeProps extends Record<string, unknown> {
	className?: string;
	variant?: VariantProps<typeof badgeVariants>['variant'];
	// OCTANE DIVERGENCE: asChild composes element descriptors (createElement),
	// not opaque compiled .tsrx children — the documented radix Slot contract.
	asChild?: boolean;
	ref?: unknown;
}

export function Badge({ className, variant = 'default', asChild = false, ...props }: BadgeProps) @{
	@if (asChild) {
		<Slot
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	} @else {
		<span
			data-slot="badge"
			data-variant={variant}
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	}
}
