import { useState } from 'octane';

// The module binds nothing else named Counter, so the default export's own name
// becomes the module binding its hoisted arm reads.
export default (function Counter(props: { depth: number; max: number }) @{
	const [count, setCount] = useState(0);
	<section>
		<button onClick={() => setCount(count + 1)}>{`${props.depth}:${count}`}</button>
		@if (props.depth < props.max) {
			<Counter depth={props.depth + 1} max={props.max} />
		}
	</section>
});
