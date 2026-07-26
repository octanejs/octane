// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/kbd.tsx. Note: upstream renders KbdGroup as
// a <kbd> host too — preserved as-is.
import { cn } from '@/lib/utils';

export interface KbdProps extends Record<string, unknown> {
	className?: string;
}

export function Kbd({ className, ...props }: KbdProps) @{
	<kbd
		data-slot="kbd"
		className={cn(
			'cn-kbd pointer-events-none inline-flex items-center justify-center select-none',
			className,
		)}
		{...props}
	/>
}

export function KbdGroup({ className, ...props }: KbdProps) @{
	<kbd
		data-slot="kbd-group"
		className={cn('cn-kbd-group inline-flex items-center', className)}
		{...props}
	/>
}
