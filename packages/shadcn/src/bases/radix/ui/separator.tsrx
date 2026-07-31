// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/separator.tsx (the `"use client"` directive
// is dropped — octane has no RSC axis).
import { Separator as SeparatorPrimitive } from '@octanejs/radix';

import { cn } from '../../../lib/utils';

export interface SeparatorProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'horizontal' | 'vertical';
	decorative?: boolean;
}

export function Separator({
	className,
	orientation = 'horizontal',
	decorative = true,
	...props
}: SeparatorProps) @{
	<SeparatorPrimitive.Root
		data-slot="separator"
		decorative={decorative}
		orientation={orientation}
		className={cn(
			'shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
			className,
		)}
		{...props}
	/>
}
