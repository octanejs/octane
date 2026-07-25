import {
	useBatcher,
	useDebouncedCallback,
	useDebouncedValue,
	useThrottledCallback,
} from '@octanejs/tanstack-pacer';

export interface CallbackProbeProps {
	value: string;
	onValue: (value: string) => void;
	wait?: number;
}

export function DebouncedCallbackProbe(props: CallbackProbeProps) @{
	const onClick = useDebouncedCallback(props.onValue, { wait: props.wait ?? 100 });

	<button id="debounced-callback" onClick={() => onClick(props.value)}>
		Debounce
	</button>
}

export function DebouncedValueProbe(props: { value: string; wait?: number }) @{
	const [value] = useDebouncedValue(props.value, { wait: props.wait ?? 100 });

	<output id="debounced-value">{value as string}</output>
}

export function ThrottledCallbackProbe(props: CallbackProbeProps) @{
	const onClick = useThrottledCallback(props.onValue, { wait: props.wait ?? 100 });

	<button id="throttled-callback" onClick={() => onClick(props.value)}>
		Throttle
	</button>
}

export function BatcherProbe(props: { onBatch: (values: string[]) => void }) @{
	const batcher = useBatcher(props.onBatch, { maxSize: 2, wait: 1000 });

	<>
		<button id="batch-first" onClick={() => batcher.addItem('first')}>
			First
		</button>
		<button id="batch-second" onClick={() => batcher.addItem('second')}>
			Second
		</button>
	</>
}
