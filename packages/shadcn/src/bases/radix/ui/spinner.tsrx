// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/spinner.tsx.
//
// OCTANE DIVERGENCE: upstream's IconPlaceholder (the CLI-resolved iconLibrary
// axis) is resolved at port time to the default library, lucide, via
// @octanejs/lucide. Other icon libraries are a registry-emit concern.
import { Loader2Icon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

export interface SpinnerProps extends Record<string, unknown> {
	className?: string;
}

export function Spinner({ className, ...props }: SpinnerProps) @{
	<Loader2Icon
		data-slot="spinner"
		role="status"
		aria-label="Loading"
		className={cn('size-4 animate-spin', className)}
		{...props}
	/>
}
