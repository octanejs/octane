// Default-Tailwind flavor (package canonical) — utilities-inlined upstream styling.
// apps/v4/registry/bases/radix/ui/skeleton.tsx.
import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export interface SkeletonProps extends HostProps<'div'> {}

export function Skeleton({ className, ...props }: SkeletonProps) @{
	<div
		data-slot="skeleton"
		className={cn('animate-pulse rounded-md bg-accent', className)}
		{...props}
	/>
}
