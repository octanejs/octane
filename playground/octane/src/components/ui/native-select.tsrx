// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/native-select.tsx. The consumer className
// lands on the WRAPPER div (upstream behavior); the <select> keeps its fixed
// classes. IconPlaceholder resolves to lucide (see spinner.tsrx).
import { ChevronDownIcon } from '@octanejs/lucide';

import { cn } from '@/lib/utils';

export interface NativeSelectProps extends Record<string, unknown> {
	className?: string;
	size?: 'sm' | 'default';
}

export function NativeSelect({ className, size = 'default', ...props }: NativeSelectProps) @{
	<div
		className={cn(
			'cn-native-select-wrapper group/native-select relative w-fit has-[select:disabled]:opacity-50',
			className,
		)}
		data-slot="native-select-wrapper"
		data-size={size}
	>
		<select
			data-slot="native-select"
			data-size={size}
			className="cn-native-select outline-none disabled:pointer-events-none disabled:cursor-not-allowed"
			{...props}
		/>
		<ChevronDownIcon
			className="cn-native-select-icon pointer-events-none absolute select-none"
			aria-hidden="true"
			data-slot="native-select-icon"
		/>
	</div>
}

export function NativeSelectOption({ className, ...props }: { className?: string } & Record<
	string,
	unknown
>) @{
	<option
		data-slot="native-select-option"
		className={cn('bg-[Canvas] text-[CanvasText]', className)}
		{...props}
	/>
}

export function NativeSelectOptGroup({ className, ...props }: { className?: string } & Record<
	string,
	unknown
>) @{
	<optgroup
		data-slot="native-select-optgroup"
		className={cn('bg-[Canvas] text-[CanvasText]', className)}
		{...props}
	/>
}
