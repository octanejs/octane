// A ref on an element inside a folded host fragment: the ref threads as a dynamic
// attribute hole (`props.hN`), so it attaches on the renderer's element exactly
// like the inline form.
export function RetRef(props) {
	return <div>
		<button ref={props.r}>x</button>
	</div>;
}

export function AtRef(props) @{
	<div>
		<button ref={props.r}>x</button>
	</div>
}
