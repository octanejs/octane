// React Aria base kbd — structure from upstream `bases/aria/ui/kbd.tsx`, which
// renders BOTH parts through RAC's Keyboard primitive (the Radix base uses a
// plain <kbd> host for each; upstream likewise renders KbdGroup as a keyboard
// element rather than a <div>). Class strings are the package's shipped
// utilities-inlined flavor, matching the Radix base.
import { Keyboard as KbdPrimitive } from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export interface KbdProps extends HostProps<'kbd'> {}

export function Kbd({ className, ...props }: KbdProps) @{
	<KbdPrimitive
		data-slot="kbd"
		className={cn(
			'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*=\'size-\'])]:size-3',
			className,
		)}
		{...props}
	/>
}

export function KbdGroup({ className, ...props }: KbdProps) @{
	<KbdPrimitive
		data-slot="kbd-group"
		className={cn('inline-flex items-center gap-1', className)}
		{...props}
	/>
}
