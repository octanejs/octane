// Base UI base button — runs on the @octanejs/base-ui `Button` primitive.
//
// TWO THINGS HERE ARE RECORDED FACTS, not guesses, both from the React Aria base's own
// provenance note:
//   1. Upstream's bases SHARE button's cva strings exactly, so the class strings below are the
//      package's shipped utilities-inlined flavor and match the other bases.
//   2. The Base UI base OMITS the `data-variant`/`data-size` attributes the aria base sets. They
//      are deliberately absent rather than forgotten — no selector in these strings keys off
//      them, so nothing styles differently for their absence.
//
// NO LinkButton. The aria base has one because RAC ships a `Link` primitive slotted as a button;
// Base UI has no such primitive, and upstream's Base UI base composes links through the `render`
// prop instead. Inventing one here would be an API this base does not have — `pagination`, which
// consumes it in the aria base, therefore stays unported until the upstream source says how.
import { cva, type VariantProps } from 'class-variance-authority';
import { Button as ButtonPrimitive } from '@octanejs/base-ui/button';

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

export interface ButtonProps extends Record<string, any> {
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
		className={cn(buttonVariants({ variant, size, className }))}
		{...props}
	/>
}
