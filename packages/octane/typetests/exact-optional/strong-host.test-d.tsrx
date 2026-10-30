'use strong';

import type { ComponentProps } from 'octane';

// A Strong module's hosts and its React-shaped prop types accept an explicit `undefined` too.
export function Panel({
	open,
	onToggle,
	...rest
}: { open: boolean; onToggle?: (() => void) | undefined } & ComponentProps<'section'>) @{
	<section
		{...rest}
		style={open ? { height: 10 } : undefined}
		onClick={onToggle}
		aria-expanded={open ? true : undefined}
	>
		{'x' as string}
	</section>
}
