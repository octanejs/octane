export type ReadyProps = { status: string; onClick: (event: MouseEvent) => void };

export function Ready(props: ReadyProps) @{
	'use dom bindings';
	<div id="ready">
		<span>{props.status as string}</span>
		<button type="button" onClick={props.onClick}>Export</button>
	</div>
}
