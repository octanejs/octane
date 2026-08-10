// React Aria base textarea — structure from upstream `bases/aria/ui/textarea.tsx`
// (RAC TextArea, className through composeRenderProps). Class strings are the
// package's shipped utilities-inlined flavor, matching the Radix base.
//
// Octane divergence (shadcn-native-input-events): per-keystroke handling is the native `onInput` event, not
// a synthetic `onChange`; native `change` keeps its commit-on-blur meaning.
import { composeRenderProps, TextArea as TextareaPrimitive } from '@octanejs/aria/components';
import type { TextAreaProps as TextareaPrimitiveProps } from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';

export interface TextareaProps extends TextareaPrimitiveProps {}

export function Textarea({ className, ...props }: TextareaProps) @{
	<TextareaPrimitive
		data-slot="textarea"
		className={composeRenderProps(
			className,
			(resolved: string | undefined) => cn(
				'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
				resolved,
			),
		)}
		{...props}
	/>
}
