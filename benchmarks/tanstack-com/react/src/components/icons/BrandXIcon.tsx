import * as React from 'react';

export function BrandXIcon({
	className,
	width = '1em',
	height = '1em',
	...props
}: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			strokeLinecap="round"
			strokeLinejoin="round"
			width={width}
			height={height}
			role="img"
			aria-hidden={props['aria-label'] ? undefined : true}
			className={className}
			{...props}
		>
			<path d="M4 4l11.733 16h4.267l-11.733 -16z"></path>
			<path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path>
		</svg>
	);
}
