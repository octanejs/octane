// React Aria base input — structure from upstream `bases/aria/ui/input.tsx`
// (RAC Input, className routed through composeRenderProps so a caller's render
// prop still receives its render values). Class strings are the package's
// shipped utilities-inlined flavor, matching the Radix base.
//
// OCTANE DIVERGENCE: per-keystroke handling is the native `onInput` event;
// native `change` keeps its commit-on-blur meaning.
import { composeRenderProps, Input as InputPrimitive } from '@octanejs/aria/components';
import type { InputProps as InputPrimitiveProps } from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';

export interface InputProps extends InputPrimitiveProps {}

export function Input({ className, type, ...props }: InputProps) @{
	<InputPrimitive
		type={type}
		data-slot="input"
		className={composeRenderProps(
			className,
			(resolved: string | undefined) => cn(
				'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
				resolved,
			),
		)}
		{...props}
	/>
}
