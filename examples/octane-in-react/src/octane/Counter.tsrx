import { useState } from 'octane';

// `label`/`step` arrive from React on every commit; `count` is Octane state
// and survives those commits (the wrapper re-renders through the same-body
// fast path).
export function Counter(props) @{
	const [count, setCount] = useState(0);
	<div class="counter">
		<span class="counter-label">
			{props.label as string}
		</span>
		<button class="counter-button" onClick={() => setCount(count + (props.step ?? 1))}>
			{'Count: ' + count}
		</button>
	</div>
}
