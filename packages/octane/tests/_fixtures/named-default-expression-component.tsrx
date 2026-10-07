import { useState } from 'octane';

// A module binding that shares the default component's function-expression
// name. `Counter` names the component only inside its own body.
const Counter = 'module binding';

export const moduleCounter = Counter;

export default (function Counter(props: { label: string; nested?: boolean }) @{
	const [count, setCount] = useState(0);
	<section>
		<button class="counter" onClick={() => setCount(count + 1)}>{`${props.label} ${count}`}</button>
		@if (!props.nested) {
			<Counter label="nested" nested />
		}
	</section>
});
