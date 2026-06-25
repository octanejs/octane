import { Suspense, ErrorBoundary, use } from 'octane-ts';

export function Suspender(props) @{
	const v = use(props.promise);
	<span id="v">
		{'v:' + v as string}
	</span>
}

export function SuspenseHost(props) @{
	<Suspense fallback="loading">
		<Suspender promise={props.promise} />
	</Suspense>
}

// Inline JSX fallback — exercises the component-prop JSX lowering.
export function SuspenseHostJsx(props) @{
	<Suspense fallback={<span id="fb">spinner</span>}>
		<Suspender promise={props.promise} />
	</Suspense>
}

function Thrower(props) @{
	if (props.bang) {
		throw new Error('boom');
	}
	<span id="ok">ok</span>
}

export function ErrorHost(props) @{
	<ErrorBoundary fallback={(e) => 'caught:' + (e as Error).message}>
		<Thrower bang={props.bang} />
	</ErrorBoundary>
}
