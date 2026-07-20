import * as React from 'react';
import type { HTMLProps } from 'react';

export const InlineCode = React.memo(function InlineCode({
	className,
	...rest
}: HTMLProps<HTMLElement>) {
	return (
		<span
			className={`border border-gray-500/20 bg-gray-500/10 rounded px-1 py-0.5${
				className ? ` ${className}` : ''
			}`}
			{...rest}
		/>
	);
});
