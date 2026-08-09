import { use } from 'octane';

interface DeoptRefInBoundaryProps {
	promise: Promise<string>;
	r: { current: Element | null } | ((el: Element | null) => void);
}

function Value(props: { promise: Promise<string> }) @{
	<i class="v">{use(props.promise) as string}</i>
}

// A VALUE-POSITION host descriptor with a ref (de-opt renderer path) mounted
// inside a @try boundary next to a suspendable sibling. Hiding the boundary
// must detach the descriptor's ref; the reveal must re-attach it.
export function DeoptRefInBoundary(props: DeoptRefInBoundaryProps) @{
	const host = <b id="deopt-target" ref={props.r}>
		x
	</b>;
	<div class="wrap">
		@try {
			<div class="content">
				{host}
				<Value promise={props.promise} />
			</div>
		} @pending {
			<span class="fallback">loading</span>
		}
	</div>
}
