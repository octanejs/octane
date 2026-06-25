// A child that throws on demand, to exercise the `@try`/`@catch` error boundary.
function Boom(props) {
	if (props.boom) throw new Error('boom');
	return <b class="ok">ok</b>;
}

// return-JSX host element containing `@try`/`@catch` — folds to the return-based
// fragment model. The try/catch bodies stay in the component (closure); the two
// helper fns thread as `props.hN` holes.
export function RetTry(props) {
	return <div>
		@try {
			<Boom boom={props.boom} />
		} @catch (e) {
			<span class="caught">caught</span>
		}
	</div>;
}

// `@{}` oracle — must produce byte-identical DOM.
export function AtTry(props) @{
	<div>
		@try {
			<Boom boom={props.boom} />
		} @catch (e) {
			<span class="caught">caught</span>
		}
	</div>
}
