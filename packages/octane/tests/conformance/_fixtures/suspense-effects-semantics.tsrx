import { use, useState, useLayoutEffect } from 'octane';

// Ported from facebook/react v19.2.7
// ReactSuspenseEffectsSemantics-test.js:611 "effects within a tree that re-suspends
// in an update › should be destroyed and recreated for function components".
// A committed boundary's layout effects are DESTROYED when an update re-suspends it
// (the content is hidden), and RECREATED when it resolves again.

function Before(props) @{
	useLayoutEffect((log) => {
		log.push('Before create layout');
		return () => log.push('Before destroy layout');
	}, [props.log]);
	<span class="before">{'Before'}</span>
}

function Async(props) @{
	const v = use(props.promise);
	<span class="async">
		{'Async-' + v as string}
	</span>
}

export function App(props) @{
	const [show, setShow] = useState(false);
	props.bind(() => setShow(true));
	@try {
		<>
			<Before log={props.log} />
			@if (show) {
				<Async promise={props.promise} />
			}
		</>
	} @pending {
		<span class="fallback">{'Fallback'}</span>
	}
}

// Multiple suspend points in one boundary (a tree that suspends in several places).
// Per ReactSuspenseEffectsSemantics-test.js:2438 — the committed siblings' layout
// effects must be destroyed exactly ONCE while the boundary is suspended, and
// recreated ONCE on full reveal (a partial resolve that leaves the boundary suspended
// must NOT re-destroy or recreate them).
function AsyncN(props) @{
	const v = use(props.promiseFor(props.id));
	<span class="async">
		{'A-' + v as string}
	</span>
}
export function MultiApp(props) @{
	const [show, setShow] = useState(false);
	props.bind(() => setShow(true));
	@try {
		<>
			<Before log={props.log} />
			@if (show) {
				<>
					<AsyncN id={1} promiseFor={props.promiseFor} />
					<AsyncN id={2} promiseFor={props.promiseFor} />
				</>
			}
		</>
	} @pending {
		<span class="fallback">{'Fallback'}</span>
	}
}

// Nested boundaries. Per ReactSuspenseEffectsSemantics-test.js:1138 — when an INNER
// boundary re-suspends, only the inner subtree's effects are destroyed; the OUTER
// boundary's committed effects (and the content between the two) are untouched.
function InnerC(props) @{
	const [n, setN] = useState(1);
	props.bindInner((x: number) => setN(x));
	const v = use(props.promiseFor(n));
	useLayoutEffect((log) => {
		log.push('Inner create');
		return () => log.push('Inner destroy');
	}, [props.log]);
	<span class="inner">
		{'I-' + v as string}
	</span>
}
export function NestedApp(props) @{
	@try {
		<>
			<Before log={props.log} />
			@try {
				<InnerC promiseFor={props.promiseFor} log={props.log} bindInner={props.bindInner} />
			} @pending {
				<span class="inner-fb">{'IF'}</span>
			}
		</>
	} @pending {
		<span class="outer-fb">{'OF'}</span>
	}
}
