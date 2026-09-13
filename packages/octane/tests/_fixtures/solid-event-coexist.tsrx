import { useState as octaneUseState } from 'octane';

export function ClickCounter() @{
	const [count, setCount] = octaneUseState(0);
	<button
		type="button"
		data-testid="click-counter"
		onClick={() => setCount(count + 1)}
	>{count as string}</button>
}
