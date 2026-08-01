// Base UI base aspect-ratio — presentational, no headless primitive in any base.
//
// UNVERIFIED PROVENANCE: derived from this package's React Aria base rather than transcribed
// from upstream's `bases/base-ui/ui/aspect-ratio.tsx`, which was not available at port time.
// `alert` was confirmed byte-identical between the two bases, which is why this is plausible —
// but it is not proof, and the bases DO diverge elsewhere. Diff the class strings against the
// upstream source before treating this as ported.
import { cn } from '../../../lib/utils';
import type { DivProps } from '../../../lib/types';

export interface AspectRatioProps extends DivProps {
	ratio: number;
}

export function AspectRatio({ ratio, className, ...props }: AspectRatioProps) @{
	<div
		data-slot="aspect-ratio"
		style={{
			'--ratio': ratio,
		} as Record<string, string | number>}
		className={cn('relative aspect-(--ratio)', className)}
		{...props}
	/>
}
