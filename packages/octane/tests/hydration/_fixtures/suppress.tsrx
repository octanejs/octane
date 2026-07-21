// suppressHydrationWarning fixtures: an element whose dynamic text + attribute are
// expected to differ between server and client (timestamps, random ids, etc.). With the
// opt-out, hydration keeps the SERVER value and emits no warning.

export function Suppressed(props) @{
	<div id={props.id} suppressHydrationWarning>{props.text as string}</div>
}

// Control: same shape WITHOUT the opt-out — should warn + patch.
export function NotSuppressed(props) @{
	<div id={props.id}>{props.text as string}</div>
}

// Spread-supplied opt-out: `suppressHydrationWarning` arriving via `{...props.rest}`
// must behave exactly like the direct attribute — a JS flag stamped before the other
// spread keys apply (never a DOM attribute), suppressing attr/class/text mismatches.
export function SpreadSuppressed(props) @{
	<div {...props.rest}>{props.text as string}</div>
}

// Control: a spread class WITHOUT the opt-out — a server/client divergence must
// patch to the client class and warn (spread classes route through the same
// hydration-aware class write as direct bindings).
export function SpreadClassed(props) @{
	<div {...props.rest}>{'x'}</div>
}
