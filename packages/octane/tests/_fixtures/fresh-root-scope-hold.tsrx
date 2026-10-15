import { use, useLayoutEffect, useState } from 'octane';

function NewRow(props) @{
	const [clicks, setClicks] = useState(0);
	// Render writes no DOM it does not own; a node outside the root changes at commit.
	useLayoutEffect(() => {
		(props.external.firstChild as Text).data = 'external:' + props.label;
		props.external.setAttribute('data-state', props.label);
	});
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
		<span
			id="committed-label"
			title={props.label}
			class={{ initial: props.label === 'initial', next: props.label === 'next' }}
		>
			{props.label as string}
		</span>
		<Reader promise={props.promise} />
	</main>
}

export function KeyedIndexHold(props: { items: string[]; promise: PromiseLike<string> }) @{
	<main>
		<ol>
			@for (const item of props.items; index i; key item) {
				<li id={'row-' + item}>{item + ':' + i}</li>
			}
		</ol>
		<Reader promise={props.promise} />
	</main>
}
