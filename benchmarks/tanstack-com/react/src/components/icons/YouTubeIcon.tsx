import * as React from 'react';

export function YouTubeIcon({
	className,
	width = '1em',
	height = '1em',
	...props
}: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 461 461"
			fill="currentColor"
			width={width}
			height={height}
			role="img"
			aria-hidden={props['aria-label'] ? undefined : true}
			className={className}
			{...props}
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M365.257,67.393H95.744C42.866,67.393,0,110.259,0,163.137v134.728 c0,52.878,42.866,95.744,95.744,95.744h269.513c52.878,0,95.744-42.866,95.744-95.744V163.137 C461.001,110.259,418.135,67.393,365.257,67.393z M300.506,237.056l-126.06,60.123c-3.359,1.602-7.239-0.847-7.239-4.568V168.607 c0-3.774,3.982-6.22,7.348-4.514l126.06,63.881C304.363,229.873,304.298,235.248,300.506,237.056z" />
		</svg>
	);
}
