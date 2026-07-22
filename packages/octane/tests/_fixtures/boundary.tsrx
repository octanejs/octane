import { Suspense, ErrorBoundary, use, useState } from 'octane';

export function Suspender(props) @{
	const v = use(props.promise);
	<span id="v">{'v:' + v as string}</span>
}

export function SuspenseHost(props) @{
	<Suspense fallback="loading">
		<ErrorBoundary fallback="caught">
			<UpdateSuspender promise={props.promise} />
		</ErrorBoundary>
	</Suspense>
}

function UpdateSuspender(props) @{
	const [pending, setPending] = useState(false);
	<section>
		<button id="suspend" onClick={() => setPending(true)}>suspend</button>
		@if (pending) {
			<Suspender promise={props.promise} />
		} @else {
			<span id="ready">ready</span>
		}
	</section>
}

// Inline JSX fallback — exercises the component-prop JSX lowering.
export function SuspenseHostJsx(props) @{
	<Suspense fallback={<span id="fb">spinner</span>}>
		<ErrorBoundary fallback="caught">
			<Suspender promise={props.promise} />
		</ErrorBoundary>
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

function ResetThrower(props) @{
	if (props.state.failed) throw new Error('reset me');
	<span id="reset-ok">recovered</span>
}

export function ResetErrorHost(props) @{
	<ErrorBoundary
		fallback={(error, reset) => <button
			id="reset-error"
			onClick={() => {
				props.state.failed = false;
				reset();
			}}
		>
			{'retry:' + (error as Error).message}
		</button>}
	>
		<ResetThrower state={props.state} />
	</ErrorBoundary>
}
