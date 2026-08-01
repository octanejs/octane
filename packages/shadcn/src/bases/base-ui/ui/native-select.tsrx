// Base UI base native-select — a real `<select>`, so no headless primitive in any base.
//
// UNVERIFIED PROVENANCE: derived from this package's React Aria base rather than transcribed
// from upstream's `bases/base-ui/ui/native-select.tsx`, which was not available at port time.
// Diff the class strings against the upstream source before treating this as ported.
//
// OCTANE DIVERGENCE: upstream's IconPlaceholder resolves to lucide via @octanejs/lucide.
// Events are native: a `<select>`'s `change` keeps its platform commit meaning, so consumer
// `onChange` handlers are passed through unrenamed.
import { ChevronDownIcon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export type NativeSelectProps =
	Omit<HostProps<'select'>, 'size'> & {
		size?: 'sm' | 'default';
	};

export function NativeSelect({ className, size = 'default', ...props }: NativeSelectProps) @{
	<div
		className={cn('group/native-select relative w-fit has-[select:disabled]:opacity-50', className)}
		data-slot="native-select-wrapper"
		data-size={size}
	>
		<select
			data-slot="native-select"
			data-size={size}
			className="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm transition-colors outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] data-[size=sm]:py-0.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
			{...props}
		/>
		<ChevronDownIcon
			className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
			aria-hidden="true"
			data-slot="native-select-icon"
		/>
	</div>
}

export function NativeSelectOption({ className, ...props }: HostProps<'option'>) @{
	<option
		data-slot="native-select-option"
		className={cn('bg-[Canvas] text-[CanvasText]', className)}
		{...props}
	/>
}

export function NativeSelectOptGroup({ className, ...props }: HostProps<'optgroup'>) @{
	<optgroup
		data-slot="native-select-optgroup"
		className={cn('bg-[Canvas] text-[CanvasText]', className)}
		{...props}
	/>
}
