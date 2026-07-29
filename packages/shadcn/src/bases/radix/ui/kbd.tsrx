// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/kbd.tsx. Note: upstream renders KbdGroup as
// a <kbd> host too — preserved as-is.
import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export interface KbdProps extends HostProps<'kbd'> {}

export function Kbd({ className, ...props }: KbdProps) @{
	<kbd
		data-slot="kbd"
		className={cn(
			'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none',
			className,
		)}
		{...props}
	/>
}

export function KbdGroup({ className, ...props }: KbdProps) @{
	<kbd
		data-slot="kbd-group"
		className={cn('inline-flex items-center gap-1', className)}
		{...props}
	/>
}
