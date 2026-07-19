import { useState } from 'octane';

function Label(props) @{
	<span id="value">
		{'count: ' + props.count}
	</span>
}

export function App() @{
	const [count, setCount] = useState(0);
	<div style="padding: 48px">
		<button id="inc" onClick={() => setCount(count + 1)}>increment</button>
		<Label count={count} />
	</div>
}
