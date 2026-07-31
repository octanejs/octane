import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function Skeleton({ className, ...props }: HostProps<'div'>) {
	return <div
		data-slot="skeleton"
		className={cn('animate-pulse rounded-md bg-muted', className)}
		{...props}
	/>;
}
