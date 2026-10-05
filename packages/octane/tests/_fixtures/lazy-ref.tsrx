import { startTransition, Suspense, use, useEffect, useLazyRef, useRef, useState } from 'octane';

export function LazyRef(props) @{
	const ref = useLazyRef(props.factory);
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{`${ref.current.name}:${count}`}</button>
}

export function FunctionRef(props) @{
	const ref = useRef(props.callback);
	<button onClick={() => props.report(ref.current)}>{'Report'}</button>
}

export function FunctionResultRef(props) @{
	const ref = useLazyRef(() => props.callback);
	<button onClick={() => props.report(ref.current)}>{'Report'}</button>
}

export function UndefinedRef(props) @{
	const ref = useLazyRef(props.factory);
	const [count, setCount] = useState(0);
	<button
		onClick={() => {
			props.report(ref.current);
			setCount(count + 1);
		}}
	>{count as string}</button>
}

export function CaptureRef(props) @{
	const ref = useLazyRef(props.factory);
	<button onClick={() => props.report(ref)}>{props.label as string}</button>
}

function SuspendedRef(props) @{
	const ref = useLazyRef(props.factory);
	const value = use(props.promise) as string;
	useEffect(() => {
		props.report(ref);
	}, []);
	<p>{`${value}:${ref.current.name}:${props.count ?? 0}`}</p>
}

export function SuspendedRefBoundary(props) @{
	const [count, setCount] = useState(0);
	<>
		<button onClick={() => setCount(count + 1)}>{count as string}</button>
		<Suspense fallback={<i>{'loading'}</i>}>
			<SuspendedRef factory={props.factory} promise={props.promise} report={props.report} />
		</Suspense>
	</>
}

export function TransitionRef(props) @{
	const [promise, setPromise] = useState(null);
	const [count, setCount] = useState(0);
	<>
		<button
			onClick={() => startTransition(() => {
				setPromise(props.next);
				setCount(count + 1);
			})}
		>{count as string}</button>
		<Suspense fallback={<i>{'loading'}</i>}>
			@if (promise === null) {
				<p>{'idle'}</p>
			} @else {
				<SuspendedRef
					factory={props.factory}
					promise={promise}
					report={props.report}
					count={count}
				/>
			}
		</Suspense>
	</>
}
