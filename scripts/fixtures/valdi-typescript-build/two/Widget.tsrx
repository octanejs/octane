export interface Props {
	label: string;
}

export function Widget(props: Props) @{
	<label value={'two:' + props.label} />
}
