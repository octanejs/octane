// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/textarea.tsx.
//
// OCTANE DIVERGENCE: per-keystroke handling is the native `onInput` event, not
// a synthetic `onChange`; native `change` keeps its commit-on-blur meaning.
import { cn } from '../lib/utils';

export interface TextareaProps extends Record<string, unknown> {
	className?: string;
}

export function Textarea({ className, ...props }: TextareaProps) @{
	<textarea
		data-slot="textarea"
		className={cn(
			'cn-textarea flex field-sizing-content min-h-16 w-full outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
			className,
		)}
		{...props}
	/>
}
