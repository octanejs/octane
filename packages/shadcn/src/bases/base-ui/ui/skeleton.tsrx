// Base UI base skeleton — presentational, no headless primitive in any base.
//
// UNVERIFIED PROVENANCE: derived from this package's React Aria base rather than transcribed
// from upstream's `bases/base-ui/ui/skeleton.tsx`, which was not available at port time.
// Skeleton is the WORST case for this, and the reason the whole batch is labelled: the Radix
// base renders `bg-accent` where the React Aria base renders `bg-muted`, so the one token that
// matters here is known to differ ACROSS bases. Verify against the upstream source.
import { cn } from '../../../lib/utils';
import type { DivProps } from '../../../lib/types';

export function Skeleton({ className, ...props }: DivProps) @{
	<div
		data-slot="skeleton"
		className={cn('animate-pulse rounded-md bg-muted', className)}
		{...props}
	/>
}
