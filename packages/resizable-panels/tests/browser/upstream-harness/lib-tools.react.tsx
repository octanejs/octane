import { createElement, type ReactNode } from 'react';
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
	children?: ReactNode;
	direction?: 'column' | 'row';
	gap?: number;
	wrap?: boolean;
	className?: string;
}) {
	return createElement(
		'div',
		{
			className,
			style: {
				display: 'flex',
				flexDirection: direction,
				gap: (gap ?? 0) * 4,
				flexWrap: wrap ? 'wrap' : undefined,
			},
		},
		children,
	);
}

export type { PropsWithChildren } from 'react';
