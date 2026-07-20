import { useState, useEffect, Suspense, use } from 'octane';

// end-to-end.js's ComponentWithLoader: kicks off an async load from a passive
// effect, swaps the loading state for the loaded message when it settles.
export function Loader(props) @{
	const [message, setMessage] = useState(null);
	useEffect(() => {
		let cancelled = false;
		props.load().then((data) => {
			if (!cancelled) setMessage(data);
		});
		return () => {
			cancelled = true;
		};
	}, []);
	<div>
		@if (message === null) {
			<div>Loading...</div>
		} @else {
			<div data-testid="message">{'Loaded this message: ' + message}</div>
		}
	</div>
}

function SuspendingContent(props) @{
	<div data-testid="content">
		{use(props.promise) as string}
	</div>
}

// Suspense reveal driven by an externally-resolved promise (the async waitFor
// + suspense port).
export function SuspenseHost(props) @{
	<Suspense fallback={<div>loading</div>}>
		<SuspendingContent promise={props.promise} />
	</Suspense>
}
