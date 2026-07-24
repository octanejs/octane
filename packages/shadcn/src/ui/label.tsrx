// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/label.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
import { Label as LabelPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export interface LabelProps extends Record<string, unknown> {
	className?: string;
}

export function Label({ className, ...props }: LabelProps) @{
	<LabelPrimitive.Root
		data-slot="label"
		className={cn(
			'cn-label flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed',
			className,
		)}
		{...props}
	/>
}
