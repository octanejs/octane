// Base UI base checkbox — runs on the @octanejs/base-ui `Checkbox` primitive.
//
// THE CONDITIONAL UTILITIES ARE ADAPTED, NOT COPIED, and the reason is structural rather than
// stylistic. Base UI's Checkbox.Root renders a `<span role="checkbox">` — verified by rendering
// it, not assumed — with a visually-hidden native `<input>` alongside it for form submission.
// A `<span>` is never `:disabled`, so Tailwind's `disabled:` variant (which compiles to the
// `:disabled` pseudo-class) can NEVER match. The primitive publishes `data-disabled` instead:
//
//   radix base:   `disabled:opacity-50`        -> matches, Root is a real button
//   base-ui base: `data-disabled:opacity-50`   <- what this file uses
//
// `data-checked:` needs no change — the radix base already uses that exact form, and Base UI
// emits `data-checked`/`data-unchecked` too. `focus-visible:` also stays: the span carries
// tabindex, so the native pseudo-class applies.
//
// UNVERIFIED PROVENANCE: the non-conditional utilities are taken from this package's radix base
// rather than transcribed from upstream's Base UI source.
import { Checkbox as CheckboxPrimitive } from '@octanejs/base-ui/checkbox';
import { CheckIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

export interface CheckboxProps extends Record<string, unknown> {
	className?: string;
}

export function Checkbox({ className, ...props }: CheckboxProps) @{
	<CheckboxPrimitive.Root
		data-slot="checkbox"
		className={cn(
			'peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary',
			className,
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator
			data-slot="checkbox-indicator"
			className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
		>
			<CheckIcon />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
}
