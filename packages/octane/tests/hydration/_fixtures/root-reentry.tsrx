import { useState } from 'octane';

export function ReentryLeaf(props) @{
	const [count, setCount] = useState(0);
	<button id={props.id} onClick={() => setCount(count + 1)}>{props.id + ':' + count}</button>
}

export function ReentryOuter(props) @{
	props.enter();
	const [count, setCount] = useState(0);
	<section id="reentry-outer">
		<button id="outer-button" onClick={() => setCount(count + 1)}>{'outer:' + count}</button>
		<span id="outer-tail">tail</span>
	</section>
}
