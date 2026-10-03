import { useLazyRef, useRef, useState } from 'octane';

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
