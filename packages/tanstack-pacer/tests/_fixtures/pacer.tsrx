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

import { useEffect } from 'octane';
import {
	useAsyncBatcher,
	useAsyncDebouncer,
	useAsyncQueuer,
	useAsyncRateLimiter,
	useAsyncThrottler,
	useDebouncer,
	useQueuer,
	useRateLimiter,
	useThrottler,
	PacerProvider,
	useDefaultPacerOptions,
	usePacerContext,
} from '@octanejs/tanstack-pacer';

export interface SchedulerLifecycleProps {
	revision: number;
	onSnapshot: (stores: unknown[]) => void;
	onUnmount: (name: string) => void;
}

export function SchedulerLifecycle(props: SchedulerLifecycleProps) {
	const batcher = useBatcher((items: number[]) => items.length, {
		onUnmount: () => props.onUnmount('batcher'),
	});
	const debouncer = useDebouncer((value: number) => value, {
		wait: 40,
		onUnmount: () => props.onUnmount('debouncer'),
	});
	const queuer = useQueuer((value: number) => value, {
		onUnmount: () => props.onUnmount('queuer'),
	});
	const limiter = useRateLimiter((value: number) => value, {
		limit: 1,
		window: 100,
		onUnmount: () => props.onUnmount('limiter'),
	});
	const throttler = useThrottler((value: number) => value, {
		wait: 40,
		onUnmount: () => props.onUnmount('throttler'),
	});
	const asyncBatcher = useAsyncBatcher(async (items: number[]) => items.length, {
		onUnmount: () => props.onUnmount('asyncBatcher'),
	});
	const asyncDebouncer = useAsyncDebouncer(async (value: number) => value, {
		wait: 40,
		onUnmount: () => props.onUnmount('asyncDebouncer'),
	});
	const asyncQueuer = useAsyncQueuer(async (value: number) => value, {
		onUnmount: () => props.onUnmount('asyncQueuer'),
	});
	const asyncLimiter = useAsyncRateLimiter(async (value: number) => value, {
		limit: 1,
		window: 100,
		onUnmount: () => props.onUnmount('asyncLimiter'),
	});
	const asyncThrottler = useAsyncThrottler(async (value: number) => value, {
		wait: 40,
		onUnmount: () => props.onUnmount('asyncThrottler'),
	});
	useEffect(() => {
		props.onSnapshot([
			batcher.store,
			debouncer.store,
			queuer.store,
			limiter.store,
			throttler.store,
			asyncBatcher.store,
			asyncDebouncer.store,
			asyncQueuer.store,
			asyncLimiter.store,
			asyncThrottler.store,
		]);
	}, [props.revision]);
	return <output>{String(props.revision)}</output>;
}

function ProviderValue(props: { id: string }) {
	const options = useDefaultPacerOptions();
	const context = usePacerContext();
	return <output id={props.id}>
		{String(options.debouncer?.wait) + ':' + String(context !== null)}
	</output>;
}

export function NestedPacerProviders(props: { wait: number }) {
	return <main>
		<ProviderValue id="unprovided" />
		<PacerProvider defaultOptions={{ debouncer: { wait: props.wait } }}>
			<ProviderValue id="outer" />
			<PacerProvider defaultOptions={{ debouncer: { wait: 80 } }}>
				<ProviderValue id="inner" />
			</PacerProvider>
		</PacerProvider>
	</main>;
}

// Dual-mode `Subscribe` children compiled from `.tsrx` are tagged block
// functions. Invoking them as render props throws (`reading 'block'`).
export function SubscribeBlockChildren() @{
	const batcher = useBatcher((items: number[]) => items.length);
	const debouncer = useDebouncer((value: number) => value, { wait: 40 });
	const queuer = useQueuer((value: number) => value);
	const limiter = useRateLimiter((value: number) => value, { limit: 1, window: 100 });
	const throttler = useThrottler((value: number) => value, { wait: 40 });
	const asyncBatcher = useAsyncBatcher(async (items: number[]) => items.length);
	const asyncDebouncer = useAsyncDebouncer(async (value: number) => value, { wait: 40 });
	const asyncQueuer = useAsyncQueuer(async (value: number) => value);
	const asyncLimiter = useAsyncRateLimiter(async (value: number) => value, {
		limit: 1,
		window: 100,
	});
	const asyncThrottler = useAsyncThrottler(async (value: number) => value, { wait: 40 });
	<div>
		<batcher.Subscribe selector={(state) => state.size}>
			<span id="batcher-block">ok</span>
		</batcher.Subscribe>
		<debouncer.Subscribe selector={(state) => state.isPending}>
			<span id="debouncer-block">ok</span>
		</debouncer.Subscribe>
		<queuer.Subscribe selector={(state) => state.size}>
			<span id="queuer-block">ok</span>
		</queuer.Subscribe>
		<limiter.Subscribe selector={(state) => state.rejectionCount}>
			<span id="limiter-block">ok</span>
		</limiter.Subscribe>
		<throttler.Subscribe selector={(state) => state.isPending}>
			<span id="throttler-block">ok</span>
		</throttler.Subscribe>
		<asyncBatcher.Subscribe selector={(state) => state.size}>
			<span id="async-batcher-block">ok</span>
		</asyncBatcher.Subscribe>
		<asyncDebouncer.Subscribe selector={(state) => state.isExecuting}>
			<span id="async-debouncer-block">ok</span>
		</asyncDebouncer.Subscribe>
		<asyncQueuer.Subscribe selector={(state) => state.size}>
			<span id="async-queuer-block">ok</span>
		</asyncQueuer.Subscribe>
		<asyncLimiter.Subscribe selector={(state) => state.rejectionCount}>
			<span id="async-limiter-block">ok</span>
		</asyncLimiter.Subscribe>
		<asyncThrottler.Subscribe selector={(state) => state.isExecuting}>
			<span id="async-throttler-block">ok</span>
		</asyncThrottler.Subscribe>
	</div>
}

export function SubscribeRenderProp() @{
	const debouncer = useDebouncer((value: number) => value, { wait: 40 });
	<debouncer.Subscribe selector={(state) => state.isPending}>
		{(pending: boolean) => <span id="rp-child">
			{pending ? 'pending' : 'idle'}
		</span>}
	</debouncer.Subscribe>
}
