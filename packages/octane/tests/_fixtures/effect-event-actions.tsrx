import {
	startTransition,
	useEffectEvent,
	useLayoutEffect,
	useOptimistic,
	useReducer,
	useState,
} from 'octane';

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
	useLayoutEffect(() => {
		props.bind(event);
	}, [props.bind]);
	<output>
		{String(state)}:{String(reduced)}:{String(props.count$.get())}
	</output>
}

export function ExternalEffectEvent(props: { bind(event: () => void): void; run(): void }) @{
	const event = useEffectEvent(() => props.run());
	useLayoutEffect(() => {
		props.bind(event);
	}, [props.bind]);
	<div />
}

export function OptimisticEffectEvent(props: {
	bind(event: () => void, add: (value: string) => void): void;
}) @{
	const [value, add] = useOptimistic('idle');
	const event = useEffectEvent(() => add('optimistic'));
	useLayoutEffect(() => {
		props.bind(event, add);
	}, [props.bind]);
	<output>{value as string}</output>
}
