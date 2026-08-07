// Base UI base badge — a plain host `<span>` carrying the shared cva strings.
//
// The cva block is byte-identical to the radix and React Aria bases (checked, not assumed), and no
// primitive is involved: badge is a span with `data-slot` and `data-variant`, and nothing
// underneath emits state. So there is no dialect here to get wrong, and no motion to mistranslate.
//
// NO ESCAPE HATCH, DELIBERATELY. Upstream's other bases each let a badge render as a different
// element, and each does it differently: radix takes `asChild` and swaps in `Slot`; React Aria
// takes a `render` FUNCTION and calls it with the computed props. Base UI has no Slot, and its own
// convention is a `render` ELEMENT prop backed by `useRender` — but badge is not a Base UI
// primitive, so nothing here decides which of those shapes upstream's Base UI badge actually
// exposes, or whether it exposes one at all.
//
// Guessing would publish an API this base may not have, and an API shape is not something a later
// commit can quietly correct. Adding the hatch once the upstream source is available is additive
// and non-breaking; shipping the wrong one is not. This follows button.tsrx in the same base,
// which omits `LinkButton` for the same reason. A consumer needing a different element today can
// spread `badgeVariants({ variant })` onto it directly, which is what the class export is for.
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export const badgeVariants = cva(
	'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
				secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
				destructive: 'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
				outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
				ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	},
);

export interface BadgeProps extends HostProps<'span'> {
	variant?: VariantProps<typeof badgeVariants>['variant'];
	/** Not supported in this base — see the header. Declared so it fails to compile, not silently. */
	asChild?: never;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) @{
	<span
		data-slot="badge"
		data-variant={variant}
		className={cn(badgeVariants({ variant }), className)}
		{...props}
	/>
}
