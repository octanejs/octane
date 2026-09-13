import type { OctaneNode } from 'octane';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...values: ClassValue[]) {
	return twMerge(clsx(values));
}

export function assert(value: unknown, message: string): asserts value {
	if (!value) throw new Error(message);
}

export function Box({
	children,
	direction,
	gap,
	wrap,
	className = '',
}: {
	children?: OctaneNode;
	direction?: 'column' | 'row';
	gap?: number;
	wrap?: boolean;
	className?: string;
}) @{
	return <div
		className={className}
		style={{
			display: 'flex',
			flexDirection: direction,
			gap: (gap ?? 0) * 4,
			flexWrap: wrap ? 'wrap' : undefined,
		}}
	>{children}</div>;
}

export type PropsWithChildren<P = object> = P & { children?: OctaneNode };
