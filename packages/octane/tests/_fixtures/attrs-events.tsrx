import { useState } from 'octane';

export function Classed(props) @{
	<div class={props.kind}>{'x'}</div>
}

export function WithAttrs(props) @{
	<a href={props.url} title={props.title}>{'link'}</a>
}
export function Clicker() @{
	const [n, setN] = useState(0);
	<button onClick={() => setN(n + 1)}>
		{n as string}
	</button>
}

export function DoubleClicker() @{
	const [n, setN] = useState(0);
	<button onDoubleClick={() => setN(n + 1)}>
		{n as string}
	</button>
}

export function SpreadDoubleClicker() @{
	const [n, setN] = useState(0);
	const props = { onDoubleClick: () => setN(n + 1) };
	<button {...props}>
		{n as string}
	</button>
}

export function FnSetter() @{
	const [n, setN] = useState(0);
	<button
		onClick={() => {
			setN((c) => c + 1);
			setN((c) => c + 1);
			setN((c) => c + 1);
		}}
	>
		{n as string}
	</button>
}
