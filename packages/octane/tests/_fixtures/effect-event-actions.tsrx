import { startTransition, useEffectEvent, useLayoutEffect, useReducer, useState } from 'octane';

export function ExternalEffectEventUpdates(props: {
	count$: { get(): number; set(value: number): void };
	bind(event: (mode: 'normal' | 'throw' | 'transition') => void): void;
	pending: Promise<void>;
}) @{
	const [state, setState] = useState(0);
	const [reduced, dispatch] = useReducer((value: number, amount: number) => value + amount, 0);
	const inner = useEffectEvent(() => {
		props.count$.set(props.count$.get() + 1);
		setState((value) => value + 1);
		dispatch(1);
	});
	const event = useEffectEvent((mode: 'normal' | 'throw' | 'transition') => {
		if (mode === 'transition') {
			startTransition(() => {
				inner();
				return props.pending;
			});
		} else {
			inner();
			if (mode === 'throw') throw new Error('event failed');
		}
	});
	useLayoutEffect(() => props.bind(event), [props.bind]);
	<output>
		{String(state)}:{String(reduced)}:{String(props.count$.get())}
	</output>
}
