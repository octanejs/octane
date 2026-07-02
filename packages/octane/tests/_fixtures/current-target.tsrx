// `event.currentTarget` during DELEGATED dispatch must be the element whose handler is
// firing (React parity) — not the delegation root. Nested handlers observe their own
// element as the walk ascends; capture-phase handlers likewise.
export function Nested(props) @{
	<div
		id="outer"
		onClick={(e) => props.log('outer:' + e.currentTarget.id + ':target=' + e.target.id)}
		onClickCapture={(e) => props.log('capture-outer:' + e.currentTarget.id)}
	>
		<button
			id="inner"
			onClick={(e) => props.log('inner:' + e.currentTarget.id + ':target=' + e.target.id)}
			onClickCapture={(e) => props.log('capture-inner:' + e.currentTarget.id)}
		>{'go'}</button>
	</div>
}

// The classic ported-code guard: only act when the event originated on the handler's own
// element (Radix RovingFocusGroup, floating-ui list nav, etc.).
export function SelfGuard(props) @{
	<div
		id="wrap"
		onClick={(e) => {
			if (e.target === e.currentTarget) props.log('self');
			else props.log('child');
		}}
	>
		<span id="kid">{'k'}</span>
	</div>
}
