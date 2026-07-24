// Default-Tailwind flavor (package canonical) — utilities-inlined upstream styling.
// apps/v4/registry/bases/radix/ui/skeleton.tsx.
import { cn } from '@/lib/utils';

export interface SkeletonProps extends Record<string, unknown> {
	className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) @{
	<div
		data-slot="skeleton"
		className={cn('animate-pulse rounded-md bg-accent', className)}
		{...props}
	/>
}
