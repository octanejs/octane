import { useState } from 'octane';
import {
	useBatcher,
	useDebouncedCallback,
	useDebouncedValue,
	useThrottledCallback,
} from '@octanejs/tanstack-pacer';

export function PacerParity(props: { onPending?: () => void }) {
	const [label, setLabel] = useState('first');
	const [debouncedLabel, setDebouncedLabel] = useState('');
	const [throttledLabel, setThrottledLabel] = useState('');
	const [debounced, setDebounced] = useState(0);
	const [throttled, setThrottled] = useState(0);
	const [batch, setBatch] = useState('');
	const [debouncedValue] = useDebouncedValue(label, { wait: 40 });
	const onDebouncedLabel = useDebouncedCallback(function (value: string) {
		setDebouncedLabel(value);
	}, { wait: 40 });
	const onThrottledLabel = useThrottledCallback(function (value: string) {
		setThrottledLabel(value);
	}, { wait: 40 });
	const onDebounced = useDebouncedCallback(function () {
		setDebounced(function (value: number) {
			return value + 1;
		});
	}, { wait: 40 });
	const onThrottled = useThrottledCallback(function () {
		setThrottled(function (value: number) {
			return value + 1;
		});
	}, { wait: 40 });
	const onPending = useDebouncedCallback(function () {
		props.onPending?.();
	}, { wait: 40 });
	const batcher = useBatcher(function (values: string[]) {
		setBatch(values.join(','));
	}, {
		maxSize: 2,
		wait: 1000,
	});

	return <main>
		<button
			id="set-first"
			onClick={function () {
				setLabel('first');
			}}
		>
			Set first
		</button>
		<button
			id="set-latest"
			onClick={function () {
				setLabel('latest');
			}}
		>
			Set latest
		</button>
		<button
			id="debounce-label"
			onClick={function () {
				onDebouncedLabel(label);
			}}
		>
			Debounce label
		</button>
		<button
			id="throttle-label"
			onClick={function () {
				onThrottledLabel(label);
			}}
		>
			Throttle label
		</button>
		<button
			id="debounce"
			onClick={function () {
				onDebounced();
			}}
		>
			Debounce
		</button>
		<button
			id="throttle"
			onClick={function () {
				onThrottled();
			}}
		>
			Throttle
		</button>
		<button
			id="batch-a"
			onClick={function () {
				batcher.addItem('a');
			}}
		>
			Batch A
		</button>
		<button
			id="batch-b"
			onClick={function () {
				batcher.addItem('b');
			}}
		>
			Batch B
		</button>
		<button
			id="pending"
			onClick={function () {
				onPending();
			}}
		>
			Pending
		</button>
		<output id="label">{'label:' + label}</output>
		<output id="debounced-label">{'debounced-label:' + debouncedLabel}</output>
		<output id="throttled-label">{'throttled-label:' + throttledLabel}</output>
		<output id="debounced-value">{'debounced-value:' + debouncedValue}</output>
		<output id="debounced">{'debounced:' + debounced}</output>
		<output id="throttled">{'throttled:' + throttled}</output>
		<output id="batch">{'batch:' + batch}</output>
	</main>;
}
