// Base UI base switch — runs on the @octanejs/base-ui `Switch` primitive.
//
// TWO ATTRIBUTE DIALECTS DIFFER FROM THE RADIX BASE, both verified by rendering the primitive:
//
//   1. Checked state. Radix publishes `data-state="checked"`, Base UI publishes bare
//      `data-checked` / `data-unchecked` attributes:
//        radix:   `data-[state=checked]:bg-primary`
//        base-ui: `data-checked:bg-primary`
//      Copying the radix form would leave the switch permanently showing its unchecked colours
//      and the thumb never translating — the exact symptom of a wrong-base copy.
//
//   2. Disabled. Switch.Root renders a `<span role="switch">`, never `:disabled`, so
//      `disabled:` cannot match; the primitive emits `data-disabled` instead.
//
// UNVERIFIED PROVENANCE: the non-conditional utilities come from this package's radix base
// rather than upstream's Base UI source.
import { Switch as SwitchPrimitive } from '@octanejs/base-ui/switch';

import { cn } from '../../../lib/utils';

export interface SwitchProps extends Record<string, unknown> {
	className?: string;
	size?: 'sm' | 'default';
}

export function Switch({ className, size = 'default', ...props }: SwitchProps) @{
	<SwitchPrimitive.Root
		data-slot="switch"
		data-size={size}
		className={cn(
			'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/80',
			className,
		)}
		{...props}
	>
		<SwitchPrimitive.Thumb
			data-slot="switch-thumb"
			className={cn(
				'pointer-events-none block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 dark:data-checked:bg-primary-foreground dark:data-unchecked:bg-foreground',
			)}
		/>
	</SwitchPrimitive.Root>
}
