export function PivotAnnotation(props: {
	className?: string;
	ref?: { current: HTMLDivElement | null };
}) @{
	<div
		style={{
			display: 'none',
			background: '#151520',
			color: 'white',
			padding: '6px 8px',
			borderRadius: 7,
			whiteSpace: 'nowrap',
		}}
		class={props.className}
		ref={props.ref}
	/>
}
