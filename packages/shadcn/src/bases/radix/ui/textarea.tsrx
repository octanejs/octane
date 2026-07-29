// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/textarea.tsx.
//
// OCTANE DIVERGENCE: per-keystroke handling is the native `onInput` event, not
// a synthetic `onChange`; native `change` keeps its commit-on-blur meaning.
import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export interface TextareaProps extends HostProps<'textarea'> {}

export function Textarea({ className, ...props }: TextareaProps) @{
	<textarea
		data-slot="textarea"
		className={cn(
			'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
			className,
		)}
		{...props}
	/>
}
