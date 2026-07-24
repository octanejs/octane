// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/radio-group.tsx (the `"use client"` directive
// is dropped — octane has no RSC axis).
import { RadioGroup as RadioGroupPrimitive } from '@octanejs/radix';

import { cn } from '../lib/utils';

export interface RadioGroupProps extends Record<string, unknown> {
	className?: string;
}

export function RadioGroup({ className, ...props }: RadioGroupProps) @{
	<RadioGroupPrimitive.Root
		data-slot="radio-group"
		className={cn('cn-radio-group w-full', className)}
		{...props}
	/>
}

export interface RadioGroupItemProps extends Record<string, unknown> {
	className?: string;
}

export function RadioGroupItem({ className, ...props }: RadioGroupItemProps) @{
	<RadioGroupPrimitive.Item
		data-slot="radio-group-item"
		className={cn(
			'cn-radio-group-item group/radio-group-item peer relative aspect-square shrink-0 border outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
			className,
		)}
		{...props}
	>
		<RadioGroupPrimitive.Indicator
			data-slot="radio-group-indicator"
			className="cn-radio-group-indicator"
		>
			<span className="cn-radio-group-indicator-icon" />
		</RadioGroupPrimitive.Indicator>
	</RadioGroupPrimitive.Item>
}
