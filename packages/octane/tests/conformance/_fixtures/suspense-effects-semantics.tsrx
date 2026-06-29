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
