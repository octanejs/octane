interface FixedChildProps {
	variant?: string;
	radius?: string;
	label?: string;
	title?: string;
	active?: boolean;
	onClick?: (event: MouseEvent) => void;
	ref?: (node: HTMLButtonElement | null) => void;
}
export function FixedChild({
	variant = 'secondary',
	radius = 'full',
	label = '',
	title,
	active,
	onClick,
	ref,
}: FixedChildProps) @{
	'use dom bindings';
	const rounded = radius === 'full';
	const classes = [
		'base',
		variant === 'primary'
			? 'primary'
			: variant === 'ghost'
				? 'ghost'
				: 'secondary',
		rounded ? 'rounded' : 'square',
		active && 'active',
	];
	<button type="button" class={classes} title={title} onClick={onClick} ref={ref}>
		@if (variant === 'primary') {
			<>
				<svg viewBox="0 0 24 24">
					<path d="M1 1L11 5L20 20L1 1" />
					<path d="M3 1L16 12L9 20" />
				</svg>
				<strong>{label as string}</strong>
			</>
		} @else {
			@if (variant === 'secondary') {
				<>
					<i>{label as string}</i>
					<svg viewBox="0 0 48 48">
						<path d="M2 2L22 8L46 46L2 2" />
						<path d="M4 2L32 24L18 46" />
					</svg>
				</>
			} @else {
				<span>{label as string}</span>
			}
		}
	</button>
}
