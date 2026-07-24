// Ported from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544
// apps/v4/registry/bases/radix/ui/skeleton.tsx.
import { cn } from '../lib/utils';

export interface SkeletonProps extends Record<string, unknown> {
	className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) @{
	<div data-slot="skeleton" className={cn('cn-skeleton animate-pulse', className)} {...props} />
}
