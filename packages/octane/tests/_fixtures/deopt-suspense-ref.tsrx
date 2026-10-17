import { use } from 'octane';

interface DeoptRefInBoundaryProps {
	promise: Promise<string>;
	r: { current: HTMLElement | null } | ((el: HTMLElement | null) => void);
}

function Value(props: { promise: Promise<string> }) @{
	<i class="v">{use(props.promise) as string}</i>
}

// A VALUE-POSITION host descriptor with a ref (de-opt renderer path) mounted
// inside a @try boundary next to a suspendable sibling. Hiding the boundary
// must detach the descriptor's ref; the reveal must re-attach it.
export function DeoptRefInBoundary(props: DeoptRefInBoundaryProps) @{
	const host = (
		<b id="deopt-target" ref={props.r}>
			x
		</b>
	);
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

// The ref sits on a pure child of a value-position host that also renders a
// component, so the host is one Block and the child another, inside it.
export function DeoptHostChildRefInBoundary(props: DeoptRefInBoundaryProps) @{
	const host = (
		<section>
			<b id="deopt-target" ref={props.r}>
				x
			</b>
			<Value promise={props.promise} />
		</section>
	);
	<div class="wrap">
		@try {
			<div class="content">{host}</div>
		} @pending {
			<span class="fallback">loading</span>
		}
	</div>
}
