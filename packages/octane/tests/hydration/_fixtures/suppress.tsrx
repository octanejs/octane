// suppressHydrationWarning fixtures: an element whose dynamic text + attribute are
// expected to differ between server and client (timestamps, random ids, etc.). With the
// opt-out, hydration keeps the SERVER value and emits no warning.

export function Suppressed(props) @{
	<div id={props.id} suppressHydrationWarning>
		{props.text as string}
	</div>
}

// Control: same shape WITHOUT the opt-out — should warn + patch.
export function NotSuppressed(props) @{
	<div id={props.id}>
		{props.text as string}
	</div>
}
