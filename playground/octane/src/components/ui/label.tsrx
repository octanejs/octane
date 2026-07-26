// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/label.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
import { Label as LabelPrimitive } from '@octanejs/radix';

import { cn } from '@/lib/utils';

export interface LabelProps extends Record<string, unknown> {
	className?: string;
}

export function Label({ className, ...props }: LabelProps) @{
	<LabelPrimitive.Root
		data-slot="label"
		className={cn(
			'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
			className,
		)}
		{...props}
	/>
}
