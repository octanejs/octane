// Renderable holes whose values are arrays and iterables of text. Nothing here
// builds an element value or passes component children, so a test importing
// only this fixture renders them without the keyed list (see the test).

import { use } from 'octane';

export function SoleChild(props: { value: unknown }) @{
	<div id="host">{props.value}</div>
}

export function Siblings(props: { value: unknown }) @{
	<div id="host">
		{'before'}
		{props.value}
		<b>{'after'}</b>
	</div>
}

function Pending(props: { promise: Promise<string> | null }) {
	return props.promise === null ? null : use(props.promise);
}

export function Suspending(props: { value: unknown; promise: Promise<string> | null }) @{
	@try {
		<div id="host">
			{props.value}
			<Pending promise={props.promise} />
		</div>
	} @pending {
		<p>{'loading'}</p>
	}
}
