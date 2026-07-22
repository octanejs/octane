type SVGIconProps =
	Record<string, any> & {
		className?: string;
		width?: string | number;
		height?: string | number;
	};

export function CheckCircleIcon({
	className,
	width = '1em',
	height = '1em',
	...props
}: SVGIconProps) {
	return <svg
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
		<circle cx="12" cy="12" r="10" />
		<path d="m9 12 2 2 4-4" />
	</svg>;
}
