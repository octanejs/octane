// Base UI base kbd — plain host `<kbd>` elements. Base UI ships no Keyboard primitive (the
// React Aria base renders both parts through RAC's `Keyboard`), so this matches the Radix
// base's plain-host shape.
//
// UNVERIFIED PROVENANCE: class strings taken from this package's React Aria base rather than
// transcribed from upstream's Base UI source.
import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function Kbd({ className, ...props }: HostProps<'kbd'>) @{
	<kbd
		data-slot="kbd"
		className={cn(
			'pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium text-muted-foreground select-none in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*=\'size-\'])]:size-3',
			className,
		)}
		{...props}
	/>
}

export function KbdGroup({ className, ...props }: HostProps<'kbd'>) @{
	<kbd
		data-slot="kbd-group"
		className={cn('inline-flex items-center gap-1', className)}
		{...props}
	/>
}
