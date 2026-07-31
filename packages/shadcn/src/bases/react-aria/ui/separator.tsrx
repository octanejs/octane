// React Aria base separator — structure from upstream `bases/aria/ui/separator.tsx`
// (RAC Separator).
//
// The class string is NOT the Radix base's. RAC's Separator publishes
// orientation as `aria-orientation`, where Radix publishes `data-orientation`,
// so the orientation-conditional utilities must key off the attribute this
// primitive actually emits — upstream's own bases diverge here for the same
// reason. The non-conditional utilities stay in step with the Radix base.
import { Separator as SeparatorPrimitive } from '@octanejs/aria/components';

import { cn } from '../../../lib/utils';

export interface SeparatorProps extends Record<string, unknown> {
	className?: string;
	orientation?: 'horizontal' | 'vertical';
}

export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) @{
	<SeparatorPrimitive
		data-slot="separator"
		orientation={orientation}
		className={cn(
			'block shrink-0 border-0 bg-border aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=vertical]:w-px aria-[orientation=vertical]:self-stretch [:is(hr)]:h-px [:is(hr)]:w-full',
			className,
		)}
		{...props}
	/>
}
