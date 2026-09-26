export interface ViewProps {
	status: string;
	tick: string;
	onClick: () => void;
}

// Deliberately bindable presentation in BOTH arms. This is a negative-control
// model of a late server reveal replacing an already activated presentation.
export function View(props: ViewProps) @{
	'use dom bindings';
	<section id="binding">
		<p id="status">{props.status as string}</p>
		<p id="tick">{props.tick as string}</p>
		<button type="button" onClick={props.onClick}>Count</button>
	</section>
}
