import { Suspense, ErrorBoundary, use, useEffect, useLayoutEffect, useState } from 'octane';

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

export function RetainedResetErrorHost(props) @{
	<ErrorBoundary
		resetRef={props.resetRef}
		fallback={(error) => <span id="retained-reset-error">{'caught:' + String(error)}</span>}
	>
		<ResetThrower state={props.state} />
	</ErrorBoundary>
}

export function RetainedResetSuspenseHost(props) @{
	<ErrorBoundary resetRef={props.resetRef} fallback="error">
		<Suspense fallback={<span id="retained-pending">pending</span>}>
			<Suspender promise={props.promise} />
		</Suspense>
	</ErrorBoundary>
}

interface EffectFailureProps {
	phase: 'layout' | 'passive';
}

function EffectFailure(props: EffectFailureProps) @{
	if (props.phase === 'layout') {
		useLayoutEffect(() => {
			throw new Error('layout failed');
		}, []);
	} else {
		useEffect(() => {
			throw new Error('passive failed');
		}, []);
	}
	<span id="effect-before-error">{'before effect'}</span>
}

export function EffectErrorHost(props: EffectFailureProps) @{
	<ErrorBoundary
		fallback={(error: unknown) =>
			<strong id="effect-error">{(error as Error).message as string}</strong>}
	>
		<EffectFailure phase={props.phase} />
	</ErrorBoundary>
}

interface BoundaryLifecycleProps {
	fail: boolean;
	log: string[];
	hostRef?: (node: Element | null) => void;
	onCleanup?: () => void;
}

function BoundaryLifecycleChild(props: BoundaryLifecycleProps) @{
	useLayoutEffect(() => {
		props.log.push('setup');
		return () => {
			props.log.push('cleanup');
			props.onCleanup?.();
		};
	}, []);
	if (props.fail) throw new Error('lifecycle failed');
	<span id="boundary-primary" ref={props.hostRef}>{'primary'}</span>
}

export function LifecycleErrorHost(props: BoundaryLifecycleProps) @{
	<ErrorBoundary
		fallback={(error: unknown) =>
			<strong id="lifecycle-error">{(error as Error).message as string}</strong>}
	>
		<BoundaryLifecycleChild
			fail={props.fail}
			log={props.log}
			hostRef={props.hostRef}
			onCleanup={props.onCleanup}
		/>
	</ErrorBoundary>
}

interface BoundaryRefProps {
	keep: boolean;
	hostRef: (node: Element | null) => void;
}

function RemovableRef(props: BoundaryRefProps) @{
	<section>
		@if (props.keep) {
			<span id="boundary-ref" ref={props.hostRef}>{'ref'}</span>
		}
		<span id="boundary-ref-sibling">{'sibling'}</span>
	</section>
}

export function RefDetachErrorHost(props: BoundaryRefProps) @{
	<ErrorBoundary
		fallback={(error: unknown) =>
			<strong id="ref-error">{(error as Error).message as string}</strong>}
	>
		<RemovableRef keep={props.keep} hostRef={props.hostRef} />
	</ErrorBoundary>
}
