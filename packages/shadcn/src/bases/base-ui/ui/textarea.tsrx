// Base UI base textarea — a plain host `<textarea>`. Base UI ships no textarea primitive (its
// Input is a native `<input>` via Field.Control), so unlike the React Aria base there is no
// `TextArea` component to compose and this matches the Radix base's plain-host shape.
//
// UNVERIFIED PROVENANCE: class string taken from this package's React Aria base rather than
// transcribed from upstream's Base UI source.
//
// OCTANE DIVERGENCE: per-keystroke handling is the native `onInput` event, not a synthetic
// `onChange`; native `change` keeps its commit-on-blur meaning.
import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function Textarea({ className, ...props }: HostProps<'textarea'>) @{
	<textarea
		data-slot="textarea"
		className={cn(
			'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
			className,
		)}
		{...props}
	/>
}
