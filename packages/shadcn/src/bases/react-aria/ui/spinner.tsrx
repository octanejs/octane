// React Aria base spinner. Upstream's aria spinner is presentational — it uses
// no RAC primitive — so this matches the Radix base apart from its own class
// string.
//
// Octane divergence (shadcn-icon-resolution): upstream's IconPlaceholder (the CLI-resolved iconLibrary
// axis) is resolved at port time to the default library, lucide, via
// @octanejs/lucide. Other icon libraries are a registry-emit concern.
//
// The props are a permissive record rather than HostProps<'svg'>: these are
// forwarded to a lucide component, not applied to a host element, so the host
// SVG attribute types do not describe them.
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
