// Default-Tailwind radio-group flavor (package canonical) — utilities-inlined
// upstream styling. Octane adaptations: "use client" dropped, lucide-react →
// @octanejs/lucide, radix-ui → @octanejs/radix; pure template JSX.
import { RadioGroup as RadioGroupPrimitive } from '@octanejs/radix';
import { CircleIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

type Props = { className?: string } & Record<string, unknown>;

export function RadioGroup({ className, ...props }: Props) @{
	<RadioGroupPrimitive.Root
		data-slot="radio-group"
		className={cn('grid gap-3', className)}
		{...props}
	/>
}

export function RadioGroupItem({ className, ...props }: Props) @{
	<RadioGroupPrimitive.Item
		data-slot="radio-group-item"
		className={cn(
			'aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
			className,
		)}
		{...props}
	>
		<RadioGroupPrimitive.Indicator
			data-slot="radio-group-indicator"
			className="relative flex items-center justify-center"
		>
			<CircleIcon
				className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-primary"
			/>
		</RadioGroupPrimitive.Indicator>
	</RadioGroupPrimitive.Item>
}
