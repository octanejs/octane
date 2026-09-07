import { setAttribute, setText, use, useState } from 'octane';

function NewRow(props) @{
	const [clicks, setClicks] = useState(0);
	setText(props.external.firstChild as Text, 'external:' + props.label);
	setAttribute(props.external, 'data-state', props.label);
	<button id="new-row" title={'row:' + props.label} onClick={() => setClicks(clicks + 1)}>
		{'row:' + props.label + ':' + clicks}
	</button>
}

function Reader(props) @{
	const value = use(props.promise);
	<output id="root-read">{value as string}</output>
}

export function FreshRootScopeHold(props) @{
	<main>
		@if (props.show) {
			<NewRow label={props.label} external={props.external} />
		}
		<span id="committed-label" title={props.label}>{props.label as string}</span>
		<Reader promise={props.promise} />
	</main>
}
