// Base UI base spinner — presentational, no headless primitive in any base.
//
// UNVERIFIED PROVENANCE: derived from this package's React Aria base rather than transcribed
// from upstream's `bases/base-ui/ui/spinner.tsx`, which was not available at port time.
// Diff the class strings against the upstream source before treating this as ported.
//
// OCTANE DIVERGENCE: upstream's IconPlaceholder (the CLI-resolved iconLibrary axis) is
// resolved at port time to the default library, lucide, via @octanejs/lucide. Other icon
// libraries are a registry-emit concern.
//
// The props are a permissive record rather than HostProps<'svg'>: these are forwarded to a
// lucide component, not applied to a host element, so the host SVG attribute types do not
// describe them.
import { Loader2Icon } from '@octanejs/lucide';

import { cn } from '../../../lib/utils';

export interface SpinnerProps extends Record<string, unknown> {
	className?: string;
}

export function Spinner({ className, ...props }: SpinnerProps) @{
	<Loader2Icon
		data-slot="spinner"
		role="status"
		aria-label="Loading"
		className={cn('size-4 animate-spin', className)}
		{...props}
	/>
}
