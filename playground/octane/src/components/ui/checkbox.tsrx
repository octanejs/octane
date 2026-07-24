// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/checkbox.tsx (the `"use client"` directive is
// dropped — octane has no RSC axis). IconPlaceholder resolves to lucide (see
// spinner.tsrx).
import { Checkbox as CheckboxPrimitive } from '@octanejs/radix';
import { CheckIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

export interface CheckboxProps extends Record<string, unknown> {
	className?: string;
}

export function Checkbox({ className, ...props }: CheckboxProps) @{
	<CheckboxPrimitive.Root
		data-slot="checkbox"
		className={cn(
			'cn-checkbox peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
			className,
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator
			data-slot="checkbox-indicator"
			className="cn-checkbox-indicator grid place-content-center text-current transition-none"
		>
			<CheckIcon />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
}
