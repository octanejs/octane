// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/switch.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis).
import { Switch as SwitchPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export interface SwitchProps extends Record<string, unknown> {
	className?: string;
	size?: 'sm' | 'default';
}

export function Switch({ className, size = 'default', ...props }: SwitchProps) @{
	<SwitchPrimitive.Root
		data-slot="switch"
		data-size={size}
		className={cn(
			'cn-switch peer group/switch relative inline-flex items-center transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 data-disabled:cursor-not-allowed data-disabled:opacity-50',
			className,
		)}
		{...props}
	>
		<SwitchPrimitive.Thumb
			data-slot="switch-thumb"
			className="cn-switch-thumb pointer-events-none block ring-0 transition-transform"
		/>
	</SwitchPrimitive.Root>
}
