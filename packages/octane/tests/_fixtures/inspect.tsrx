import { useState as octaneUseState } from 'octane';

export function InspectLabel(props: { text: string }) @{
	<span data-testid="label">{props.text as string}</span>
}

export function InspectCounter(props: { expose: (set: (n: number) => void) => void }) @{
	const [count, setCount] = octaneUseState(0);
	props.expose(setCount);
	<span data-testid="count">{count as string}</span>
}
