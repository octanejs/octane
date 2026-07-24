// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/input.tsx.
//
// OCTANE DIVERGENCE: per-keystroke handling is the native `onInput` event, not
// a synthetic `onChange`; native `change` keeps its commit-on-blur meaning.
import { cn } from '../lib/utils';

export interface InputProps extends Record<string, unknown> {
	className?: string;
	type?: string;
}

export function Input({ className, type, ...props }: InputProps) @{
	<input
		type={type}
		data-slot="input"
		className={cn(
			'cn-input w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
			className,
		)}
		{...props}
	/>
}
