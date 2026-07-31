// React Aria base button — structure from upstream `bases/aria/ui/button.tsx`
// (RAC Button + Link primitives, both slotted as `button`, and the aria base's
// data-variant/data-size attributes, which the Base UI base omits).
//
// STYLING: the cva strings are this package's Radix-base (default-Tailwind,
// utilities-inlined) flavor rather than upstream's `cn-*` semantic hooks, so
// this component styles against a plain Tailwind v4 build like the migrated
// Radix families do. Upstream's own bases share button's class strings exactly,
// so nothing is lost here — but that is NOT a general rule: where a selector
// keys off a primitive-emitted attribute the bases legitimately diverge (the
// Radix separator styles `data-horizontal:`, the aria one
// `aria-[orientation=horizontal]:`). `tests/cross-base.test.ts` therefore pins
// the structural contract — data-slot names and exported components — not class
// equality.
import { cva, type VariantProps } from 'class-variance-authority';
import { Button as ButtonPrimitive, Link as LinkPrimitive } from '@octanejs/aria/components';
import type {
	ButtonProps as ButtonPrimitiveProps,
	LinkProps as LinkPrimitiveProps,
} from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';

export const buttonVariants = cva(
	'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/80',
				outline: 'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
				ghost: 'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
				destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
				link: 'text-primary underline-offset-4 hover:underline',
			},
			size: {
				default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				xs: 'h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=\'size-\'])]:size-3',
				sm: 'h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*=\'size-\'])]:size-3.5',
				lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				icon: 'size-8',
				'icon-xs': 'size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*=\'size-\'])]:size-3',
				'icon-sm': 'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
				'icon-lg': 'size-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

export interface ButtonProps extends Omit<ButtonPrimitiveProps, 'className'> {
	variant?: ButtonVariants['variant'];
	size?: ButtonVariants['size'];
	className?: string;
}

export interface LinkButtonProps extends Omit<LinkPrimitiveProps, 'className'> {
	variant?: ButtonVariants['variant'];
	size?: ButtonVariants['size'];
	className?: string;
}

export function Button({
	className,
	variant = 'default',
	size = 'default',
	...props
}: ButtonProps) @{
	<ButtonPrimitive
		data-slot="button"
		data-variant={variant}
		data-size={size}
		className={cn(buttonVariants({ variant, size, className }))}
		{...props}
	/>
}

export function LinkButton({
	className,
	variant = 'default',
	size = 'default',
	...props
}: LinkButtonProps) @{
	<LinkPrimitive
		data-slot="button"
		data-variant={variant}
		data-size={size}
		className={cn(buttonVariants({ variant, size, className }))}
		{...props}
	/>
}
