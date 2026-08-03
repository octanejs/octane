// Base UI base progress — runs on @octanejs/base-ui's Progress.
//
// TWO STRUCTURAL DIFFERENCES FROM THE RADIX BASE, both verified by rendering the primitive
// rather than inferred:
//
//   1. THERE IS A TRACK PART. Radix goes Root > Indicator; Base UI goes Root > Track > Indicator,
//      and the Track is what carries the rail. Rendering an Indicator directly under Root would
//      put it outside the element the primitive sizes against.
//
//   2. THE INDICATOR SIZES ITSELF. Radix leaves the fill entirely to the consumer, which is why
//      its base ships `style={{ transform: translateX(-${100 - value}%) }}`. Base UI's Indicator
//      already emits `width: <value>%` inline. Carrying the radix transform across would shift a
//      correctly-sized bar sideways by the same amount again — a double offset, worst at the
//      midpoint and invisible at 0% and 100%.
//
// So `value` is forwarded to the Root (which owns the aria-valuenow/valuetext contract) and NOT
// turned into a transform.
//
// UNVERIFIED PROVENANCE: class strings come from this package's radix base rather than
// transcribed from upstream's Base UI source; the rail/fill classes are split across Track and
// Indicator to match the extra part.
import { Progress as ProgressPrimitive } from '@octanejs/base-ui/progress';

import { cn } from '../../../lib/utils';

export interface ProgressProps extends Record<string, unknown> {
	className?: string;
	value?: number | null;
}

export function Progress({ className, value, ...props }: ProgressProps) @{
	// Base UI's Root types `value` as `number | null` where shadcn's prop is optional, and null is
	// its documented indeterminate state — so an omitted value maps to null rather than being
	// forwarded as undefined.
	<ProgressPrimitive.Root data-slot="progress" value={value ?? null} {...props}>
		<ProgressPrimitive.Track
			data-slot="progress-track"
			className={cn('relative h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}
		>
			<ProgressPrimitive.Indicator
				data-slot="progress-indicator"
				className="h-full bg-primary transition-all"
			/>
		</ProgressPrimitive.Track>
	</ProgressPrimitive.Root>
}
