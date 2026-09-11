interface StyleProps {
	discarded: string;
	margin: string | null;
	top: string | null;
}

export function ShorthandStyles(props: StyleProps) @{
	<section>
		<div
			id="longhand-first"
			style={{ marginTop: props.discarded, margin: props.margin, marginTop: props.top }}
		/>
		<div
			id="shorthand-first"
			style={{ margin: props.discarded, marginTop: props.top, margin: props.margin }}
		/>
	</section>
}
