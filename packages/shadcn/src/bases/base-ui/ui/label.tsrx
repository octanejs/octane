// Base UI base label — runs on @octanejs/base-ui's `Field.Label`, which is Base UI's label part
// (there is no standalone Label subpath; the label lives in the Field family).
//
// SIMPLER THAN THE ARIA BASE, on purpose. The React Aria version has to null out `LabelContext`
// when a bare `htmlFor` is passed, because RAC's Label pulls its `for` target from whichever
// labelable context it sits inside and would otherwise silently override the caller's. Base UI's
// label associates through Field instead and reads no such ambient context, so there is nothing
// to neutralise and no provider wrapper here.
//
// UNVERIFIED PROVENANCE: class string taken from this package's React Aria base rather than
// transcribed from upstream's Base UI source. Note it contains `group-data-[disabled=true]:` and
// `peer-data-disabled:` selectors, which DO key off attributes a primitive emits — worth
// checking against the upstream source before treating this as ported.
import { Field } from '@octanejs/base-ui/field';

import { cn } from '../../../lib/utils';

export function Label({ className, ...props }: Record<string, any>) @{
	<Field.Label
		data-slot="label"
		className={cn(
			'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:opacity-50',
			className,
		)}
		{...props}
	/>
}
