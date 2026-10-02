// Each server arm renders inline what the client arm renders through a
// component whose template has several roots, so the server output has no
// range for that call.

function A() @{
	<b>{'a'}</b>
}

function F() @{
	<>
		<s>{'s'}</s>
		<i>{'i'}</i>
	</>
}

// Its last root is a component, whose own range ends the fragment's content.
function G() @{
	<>
		<s>{'s'}</s>
		<A />
	</>
}

type Props = { server?: boolean };

export function FX(props: Props) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<i>{'i'}</i>
				<A />
			</>
		} @else {
			<>
				<F />
				<A />
			</>
		}
	</div>
}

export function GX(props: Props) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
				<A />
				<A />
			</>
		} @else {
			<>
				<G />
				<A />
			</>
		}
	</div>
}

// The server arm ends where G's component hole would start.
export function HX(props: Props) @{
	<div>
		@if (props.server) {
			<>
				<s>{'s'}</s>
			</>
		} @else {
			<>
				<G />
			</>
		}
		<u>{'u'}</u>
	</div>
}
