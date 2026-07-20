import { HTMLProps } from 'react';
import { twMerge } from 'tailwind-merge';

export function DocContainer({
	children,
	...props
}: { children: React.ReactNode } & HTMLProps<HTMLDivElement>) {
	return (
		<div {...props} className={twMerge('w-full max-w-full', props.className)}>
			{children}
		</div>
	);
}
