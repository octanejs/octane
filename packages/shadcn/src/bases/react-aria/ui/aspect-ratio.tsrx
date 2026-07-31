import { cn } from '../../../lib/utils';
import type { HostProps } from '../../../lib/types';

export function AspectRatio({ ratio, className, ...props }: HostProps<'div'> & { ratio: number }) {
	return <div
		data-slot="aspect-ratio"
		style={{
			'--ratio': ratio,
		} as Record<string, string | number>}
		className={cn('relative aspect-(--ratio)', className)}
		{...props}
	/>;
}
