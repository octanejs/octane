// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/progress.tsx (the `"use client"` directive
// is dropped — octane has no RSC axis). As upstream, `value` drives only the
// indicator transform — it is destructured off and NOT forwarded to the radix
// Root, whose role/aria-valuemax/data-state contract comes from its defaults.
import { Progress as ProgressPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export interface ProgressProps extends Record<string, unknown> {
	className?: string;
	value?: number | null;
}

export function Progress({ className, value, ...props }: ProgressProps) @{
	<ProgressPrimitive.Root
		data-slot="progress"
		className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
		{...props}
	>
		<ProgressPrimitive.Indicator
			data-slot="progress-indicator"
			className="h-full w-full flex-1 bg-primary transition-all"
			style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
		/>
	</ProgressPrimitive.Root>
}
