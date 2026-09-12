// Public contract probes use the immutable release's installed declarations as the oracle.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
import type { ExpectedContracts } from '../expected-contracts';
type SyncWork = (value: number) => number;
type AsyncWork = (value: number) => Promise<number>;

import * as Actual0 from '@tanstack/react-pacer';
import * as Expected0 from '../../node_modules/@tanstack/react-pacer/dist/index';
type Entry0_PacerProvider = Assert<
	Equal<
		Omit<Parameters<typeof Actual0.PacerProvider>[0], 'children'>,
		ExpectedContracts['PacerProvider']
	>
>;
type Entry0_PacerProviderOptions = Assert<
	Equal<Actual0.PacerProviderOptions, ExpectedContracts['PacerProviderOptions']>
>;
type Entry0_PacerProviderProps = Assert<
	Equal<Omit<Actual0.PacerProviderProps, 'children'>, ExpectedContracts['PacerProviderProps']>
>;
type Entry0_ReactAsyncBatcher = Assert<
	Equal<
		Omit<Actual0.ReactAsyncBatcher<number>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncBatcher']
	>
>;
type Entry0_ReactAsyncBatcherOptions = Assert<
	Equal<
		Omit<Actual0.ReactAsyncBatcherOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncBatcherOptions']
	>
>;
type Entry0_ReactAsyncDebouncer = Assert<
	Equal<
		Omit<Actual0.ReactAsyncDebouncer<AsyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncDebouncer']
	>
>;
type Entry0_ReactAsyncDebouncerOptions = Assert<
	Equal<
		Omit<Actual0.ReactAsyncDebouncerOptions<AsyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncDebouncerOptions']
	>
>;
type Entry0_ReactAsyncQueuer = Assert<
	Equal<Omit<Actual0.ReactAsyncQueuer<number>, 'Subscribe'>, ExpectedContracts['ReactAsyncQueuer']>
>;
type Entry0_ReactAsyncQueuerOptions = Assert<
	Equal<
		Omit<Actual0.ReactAsyncQueuerOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncQueuerOptions']
	>
>;
type Entry0_ReactAsyncRateLimiter = Assert<
	Equal<
		Omit<Actual0.ReactAsyncRateLimiter<AsyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncRateLimiter']
	>
>;
type Entry0_ReactAsyncRateLimiterOptions = Assert<
	Equal<
		Omit<Actual0.ReactAsyncRateLimiterOptions<AsyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncRateLimiterOptions']
	>
>;
type Entry0_ReactAsyncThrottler = Assert<
	Equal<
		Omit<Actual0.ReactAsyncThrottler<AsyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncThrottler']
	>
>;
type Entry0_ReactAsyncThrottlerOptions = Assert<
	Equal<
		Omit<Actual0.ReactAsyncThrottlerOptions<AsyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncThrottlerOptions']
	>
>;
type Entry0_ReactBatcher = Assert<
	Equal<Omit<Actual0.ReactBatcher<number>, 'Subscribe'>, ExpectedContracts['ReactBatcher']>
>;
type Entry0_ReactBatcherOptions = Assert<
	Equal<
		Omit<Actual0.ReactBatcherOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactBatcherOptions']
	>
>;
type Entry0_ReactDebouncer = Assert<
	Equal<Omit<Actual0.ReactDebouncer<SyncWork>, 'Subscribe'>, ExpectedContracts['ReactDebouncer']>
>;
type Entry0_ReactDebouncerOptions = Assert<
	Equal<
		Omit<Actual0.ReactDebouncerOptions<SyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactDebouncerOptions']
	>
>;
type Entry0_ReactQueuer = Assert<
	Equal<Omit<Actual0.ReactQueuer<number>, 'Subscribe'>, ExpectedContracts['ReactQueuer']>
>;
type Entry0_ReactQueuerOptions = Assert<
	Equal<
		Omit<Actual0.ReactQueuerOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactQueuerOptions']
	>
>;
type Entry0_ReactRateLimiter = Assert<
	Equal<
		Omit<Actual0.ReactRateLimiter<SyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactRateLimiter']
	>
>;
type Entry0_ReactRateLimiterOptions = Assert<
	Equal<
		Omit<Actual0.ReactRateLimiterOptions<SyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactRateLimiterOptions']
	>
>;
type Entry0_ReactThrottler = Assert<
	Equal<Omit<Actual0.ReactThrottler<SyncWork>, 'Subscribe'>, ExpectedContracts['ReactThrottler']>
>;
type Entry0_ReactThrottlerOptions = Assert<
	Equal<
		Omit<Actual0.ReactThrottlerOptions<SyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactThrottlerOptions']
	>
>;
type Entry0_useAsyncBatchedCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useAsyncBatchedCallback<number>>,
		ExpectedContracts['useAsyncBatchedCallback']
	>
>;
type Entry0_useAsyncBatcher = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useAsyncBatcher<number>>, 'Subscribe'>,
		ExpectedContracts['useAsyncBatcher']
	>
>;
type Entry0_useAsyncDebouncedCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useAsyncDebouncedCallback<AsyncWork>>,
		ExpectedContracts['useAsyncDebouncedCallback']
	>
>;
type Entry0_useAsyncDebouncer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useAsyncDebouncer<AsyncWork>>, 'Subscribe'>,
		ExpectedContracts['useAsyncDebouncer']
	>
>;
type Entry0_useAsyncQueuedState = Assert<
	Equal<
		ReturnType<typeof Actual0.useAsyncQueuedState<number>>[0],
		ExpectedContracts['useAsyncQueuedState']
	>
>;
type Entry0_useAsyncQueuer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useAsyncQueuer<number>>, 'Subscribe'>,
		ExpectedContracts['useAsyncQueuer']
	>
>;
type Entry0_useAsyncRateLimitedCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useAsyncRateLimitedCallback<AsyncWork>>,
		ExpectedContracts['useAsyncRateLimitedCallback']
	>
>;
type Entry0_useAsyncRateLimiter = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useAsyncRateLimiter<AsyncWork>>, 'Subscribe'>,
		ExpectedContracts['useAsyncRateLimiter']
	>
>;
type Entry0_useAsyncThrottledCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useAsyncThrottledCallback<AsyncWork>>,
		ExpectedContracts['useAsyncThrottledCallback']
	>
>;
type Entry0_useAsyncThrottler = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useAsyncThrottler<AsyncWork>>, 'Subscribe'>,
		ExpectedContracts['useAsyncThrottler']
	>
>;
type Entry0_useBatchedCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useBatchedCallback<number>>,
		ExpectedContracts['useBatchedCallback']
	>
>;
type Entry0_useBatcher = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useBatcher<number>>, 'Subscribe'>,
		ExpectedContracts['useBatcher']
	>
>;
type Entry0_useDebouncedCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useDebouncedCallback<SyncWork>>,
		ExpectedContracts['useDebouncedCallback']
	>
>;
type Entry0_useDebouncedState = Assert<
	Equal<
		ReturnType<typeof Actual0.useDebouncedState<number>>[0],
		ExpectedContracts['useDebouncedState']
	>
>;
type Entry0_useDebouncedValue = Assert<
	Equal<
		ReturnType<typeof Actual0.useDebouncedValue<number>>[0],
		ExpectedContracts['useDebouncedValue']
	>
>;
type Entry0_useDebouncer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useDebouncer<SyncWork>>, 'Subscribe'>,
		ExpectedContracts['useDebouncer']
	>
>;
type Entry0_useDefaultPacerOptions = Assert<
	Equal<
		ReturnType<typeof Actual0.useDefaultPacerOptions>,
		ExpectedContracts['useDefaultPacerOptions']
	>
>;
type Entry0_usePacerContext = Assert<
	Equal<ReturnType<typeof Actual0.usePacerContext>, ExpectedContracts['usePacerContext']>
>;
type Entry0_useQueuedState = Assert<
	Equal<ReturnType<typeof Actual0.useQueuedState<number>>[0], ExpectedContracts['useQueuedState']>
>;
type Entry0_useQueuedValue = Assert<
	Equal<ReturnType<typeof Actual0.useQueuedValue<number>>[0], ExpectedContracts['useQueuedValue']>
>;
type Entry0_useQueuer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useQueuer<number>>, 'Subscribe'>,
		ExpectedContracts['useQueuer']
	>
>;
type Entry0_useRateLimitedCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useRateLimitedCallback<SyncWork>>,
		ExpectedContracts['useRateLimitedCallback']
	>
>;
type Entry0_useRateLimitedState = Assert<
	Equal<
		ReturnType<typeof Actual0.useRateLimitedState<number>>[0],
		ExpectedContracts['useRateLimitedState']
	>
>;
type Entry0_useRateLimitedValue = Assert<
	Equal<
		ReturnType<typeof Actual0.useRateLimitedValue<number>>[0],
		ExpectedContracts['useRateLimitedValue']
	>
>;
type Entry0_useRateLimiter = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useRateLimiter<SyncWork>>, 'Subscribe'>,
		ExpectedContracts['useRateLimiter']
	>
>;
type Entry0_useThrottledCallback = Assert<
	Equal<
		ReturnType<typeof Actual0.useThrottledCallback<SyncWork>>,
		ExpectedContracts['useThrottledCallback']
	>
>;
type Entry0_useThrottledState = Assert<
	Equal<
		ReturnType<typeof Actual0.useThrottledState<number>>[0],
		ExpectedContracts['useThrottledState']
	>
>;
type Entry0_useThrottledValue = Assert<
	Equal<
		ReturnType<typeof Actual0.useThrottledValue<number>>[0],
		ExpectedContracts['useThrottledValue']
	>
>;
type Entry0_useThrottler = Assert<
	Equal<
		Omit<ReturnType<typeof Actual0.useThrottler<SyncWork>>, 'Subscribe'>,
		ExpectedContracts['useThrottler']
	>
>;
type Entry0_AnyAsyncFunction = Assert<
	Equal<Actual0.AnyAsyncFunction, ExpectedContracts['AnyAsyncFunction']>
>;
type Entry0_AnyFunction = Assert<Equal<Actual0.AnyFunction, ExpectedContracts['AnyFunction']>>;
Actual0.AsyncBatcher satisfies (typeof Expected0)['AsyncBatcher'];
type Entry0_AsyncBatcherOptions = Assert<
	Equal<Actual0.AsyncBatcherOptions<number>, ExpectedContracts['AsyncBatcherOptions']>
>;
type Entry0_AsyncBatcherState = Assert<
	Equal<Actual0.AsyncBatcherState<number>, ExpectedContracts['AsyncBatcherState']>
>;
Actual0.AsyncDebouncer satisfies (typeof Expected0)['AsyncDebouncer'];
type Entry0_AsyncDebouncerOptions = Assert<
	Equal<Actual0.AsyncDebouncerOptions<AsyncWork>, ExpectedContracts['AsyncDebouncerOptions']>
>;
type Entry0_AsyncDebouncerState = Assert<
	Equal<Actual0.AsyncDebouncerState<AsyncWork>, ExpectedContracts['AsyncDebouncerState']>
>;
Actual0.AsyncQueuer satisfies (typeof Expected0)['AsyncQueuer'];
type Entry0_AsyncQueuerOptions = Assert<
	Equal<Actual0.AsyncQueuerOptions<number>, ExpectedContracts['AsyncQueuerOptions']>
>;
type Entry0_AsyncQueuerState = Assert<
	Equal<Actual0.AsyncQueuerState<number>, ExpectedContracts['AsyncQueuerState']>
>;
Actual0.AsyncRateLimiter satisfies (typeof Expected0)['AsyncRateLimiter'];
type Entry0_AsyncRateLimiterOptions = Assert<
	Equal<Actual0.AsyncRateLimiterOptions<AsyncWork>, ExpectedContracts['AsyncRateLimiterOptions']>
>;
type Entry0_AsyncRateLimiterState = Assert<
	Equal<Actual0.AsyncRateLimiterState<AsyncWork>, ExpectedContracts['AsyncRateLimiterState']>
>;
Actual0.AsyncRetryer satisfies (typeof Expected0)['AsyncRetryer'];
type Entry0_AsyncRetryerOptions = Assert<
	Equal<Actual0.AsyncRetryerOptions<AsyncWork>, ExpectedContracts['AsyncRetryerOptions']>
>;
type Entry0_AsyncRetryerState = Assert<
	Equal<Actual0.AsyncRetryerState<AsyncWork>, ExpectedContracts['AsyncRetryerState']>
>;
Actual0.AsyncThrottler satisfies (typeof Expected0)['AsyncThrottler'];
type Entry0_AsyncThrottlerOptions = Assert<
	Equal<Actual0.AsyncThrottlerOptions<AsyncWork>, ExpectedContracts['AsyncThrottlerOptions']>
>;
type Entry0_AsyncThrottlerState = Assert<
	Equal<Actual0.AsyncThrottlerState<AsyncWork>, ExpectedContracts['AsyncThrottlerState']>
>;
Actual0.Batcher satisfies (typeof Expected0)['Batcher'];
type Entry0_BatcherOptions = Assert<
	Equal<Actual0.BatcherOptions<number>, ExpectedContracts['BatcherOptions']>
>;
type Entry0_BatcherState = Assert<
	Equal<Actual0.BatcherState<number>, ExpectedContracts['BatcherState']>
>;
Actual0.Debouncer satisfies (typeof Expected0)['Debouncer'];
type Entry0_DebouncerOptions = Assert<
	Equal<Actual0.DebouncerOptions<SyncWork>, ExpectedContracts['DebouncerOptions']>
>;
type Entry0_DebouncerState = Assert<
	Equal<Actual0.DebouncerState<SyncWork>, ExpectedContracts['DebouncerState']>
>;
type Entry0_OptionalKeys = Assert<
	Equal<Actual0.OptionalKeys<{ value: number }, 'value'>, ExpectedContracts['OptionalKeys']>
>;
type Entry0_PacerDevtoolsWirePayload = Assert<
	Equal<Actual0.PacerDevtoolsWirePayload, ExpectedContracts['PacerDevtoolsWirePayload']>
>;
type Entry0_PacerEventMap = Assert<
	Equal<Actual0.PacerEventMap, ExpectedContracts['PacerEventMap']>
>;
type Entry0_PacerEventName = Assert<
	Equal<Actual0.PacerEventName, ExpectedContracts['PacerEventName']>
>;
type Entry0_QueuePosition = Assert<
	Equal<Actual0.QueuePosition, ExpectedContracts['QueuePosition']>
>;
Actual0.Queuer satisfies (typeof Expected0)['Queuer'];
type Entry0_QueuerOptions = Assert<
	Equal<Actual0.QueuerOptions<number>, ExpectedContracts['QueuerOptions']>
>;
type Entry0_QueuerState = Assert<
	Equal<Actual0.QueuerState<number>, ExpectedContracts['QueuerState']>
>;
Actual0.RateLimiter satisfies (typeof Expected0)['RateLimiter'];
type Entry0_RateLimiterOptions = Assert<
	Equal<Actual0.RateLimiterOptions<SyncWork>, ExpectedContracts['RateLimiterOptions']>
>;
type Entry0_RateLimiterState = Assert<
	Equal<Actual0.RateLimiterState, ExpectedContracts['RateLimiterState']>
>;
Actual0.Throttler satisfies (typeof Expected0)['Throttler'];
type Entry0_ThrottlerOptions = Assert<
	Equal<Actual0.ThrottlerOptions<SyncWork>, ExpectedContracts['ThrottlerOptions']>
>;
type Entry0_ThrottlerState = Assert<
	Equal<Actual0.ThrottlerState<SyncWork>, ExpectedContracts['ThrottlerState']>
>;
Actual0.asyncBatch satisfies (typeof Expected0)['asyncBatch'];
Actual0.asyncBatcherOptions satisfies (typeof Expected0)['asyncBatcherOptions'];
Actual0.asyncDebounce satisfies (typeof Expected0)['asyncDebounce'];
Actual0.asyncDebouncerOptions satisfies (typeof Expected0)['asyncDebouncerOptions'];
Actual0.asyncQueue satisfies (typeof Expected0)['asyncQueue'];
Actual0.asyncQueuerOptions satisfies (typeof Expected0)['asyncQueuerOptions'];
Actual0.asyncRateLimit satisfies (typeof Expected0)['asyncRateLimit'];
Actual0.asyncRateLimiterOptions satisfies (typeof Expected0)['asyncRateLimiterOptions'];
Actual0.asyncRetry satisfies (typeof Expected0)['asyncRetry'];
Actual0.asyncRetryerOptions satisfies (typeof Expected0)['asyncRetryerOptions'];
Actual0.asyncThrottle satisfies (typeof Expected0)['asyncThrottle'];
Actual0.asyncThrottlerOptions satisfies (typeof Expected0)['asyncThrottlerOptions'];
Actual0.batch satisfies (typeof Expected0)['batch'];
Actual0.debounce satisfies (typeof Expected0)['debounce'];
Actual0.debouncerOptions satisfies (typeof Expected0)['debouncerOptions'];
Actual0.emitChange satisfies (typeof Expected0)['emitChange'];
Actual0.getPacerDevtoolsInstance satisfies (typeof Expected0)['getPacerDevtoolsInstance'];
Actual0.isFunction satisfies (typeof Expected0)['isFunction'];
Actual0.pacerEventClient satisfies (typeof Expected0)['pacerEventClient'];
Actual0.parseFunctionOrValue satisfies (typeof Expected0)['parseFunctionOrValue'];
Actual0.queue satisfies (typeof Expected0)['queue'];
Actual0.queuerOptions satisfies (typeof Expected0)['queuerOptions'];
Actual0.rateLimit satisfies (typeof Expected0)['rateLimit'];
Actual0.rateLimiterOptions satisfies (typeof Expected0)['rateLimiterOptions'];
Actual0.throttle satisfies (typeof Expected0)['throttle'];
Actual0.throttlerOptions satisfies (typeof Expected0)['throttlerOptions'];
// @ts-expect-error Async callback arguments retain their numeric input type.
Actual0.useAsyncDebouncedCallback(async (value: number) => value, { wait: 10 })('wrong');
