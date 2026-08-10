// Base UI base input — runs on the @octanejs/base-ui `Input` primitive, which is a native
// `<input>` wired into Field (it is literally `Field.Control`).
//
// No `composeRenderProps` here, unlike the React Aria base: RAC routes `className` through a
// render-prop pipeline that must be composed, whereas Base UI's `className` is a plain string or
// a `(state) => string`, so `cn` applies directly.
//
// UNVERIFIED PROVENANCE: the class string is taken from this package's React Aria base rather
// than transcribed from upstream's Base UI source. Nothing in it keys off a primitive-emitted
// attribute, so it is a lower-risk case than `separator` — but verify before treating as ported.
//
// Octane divergence (shadcn-native-input-events): per-keystroke handling is the native `onInput` event; native `change`
// keeps its commit-on-blur meaning.
import { Input as InputPrimitive } from '@octanejs/base-ui/input';

import { cn } from '../../../lib/utils';

export function Input({ className, type, ...props }: Record<string, any>) @{
	<InputPrimitive
		type={type}
		data-slot="input"
		className={cn(
			'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
			className,
		)}
		{...props}
	/>
}
