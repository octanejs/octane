// Base UI base separator — runs on the @octanejs/base-ui `Separator` primitive.
//
// THE CLASS STRING IS DELIBERATELY THE ARIA BASE'S, NOT THE RADIX BASE'S, and this is the one
// family where copying the wrong base is a real bug rather than a cosmetic risk. The
// orientation-conditional utilities must key off the attribute the primitive actually emits:
//
//   Radix     sets `data-orientation` -> `data-horizontal:h-px`
//   RAC       sets `aria-orientation` -> `aria-[orientation=horizontal]:h-px`
//   Base UI   sets `aria-orientation` -> same as RAC (verified in the primitive: it renders
//             `role="separator"` plus `aria-orientation={orientation}`)
//
// Taking the Radix string here would produce a separator with no height or width at all, and
// nothing in a class-string comparison would flag it. Upstream's own bases diverge here for
// exactly this reason. The non-conditional utilities stay in step with the other bases.
import { Separator as SeparatorPrimitive } from '@octanejs/base-ui/separator';

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
