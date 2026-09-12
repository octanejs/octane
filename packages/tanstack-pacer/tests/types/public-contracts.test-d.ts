// Public contract probes use the immutable release's installed declarations as the oracle.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
import type { ExpectedContracts } from '../../typetests/expected-contracts';
type SyncWork = (value: number) => number;
type AsyncWork = (value: number) => Promise<number>;

import * as Actual0 from '@octanejs/tanstack-pacer';
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
import * as Actual1 from '@octanejs/tanstack-pacer/async-batcher';
import * as Expected1 from '../../node_modules/@tanstack/react-pacer/dist/async-batcher/index';
type Entry1_ReactAsyncBatcher = Assert<
	Equal<
		Omit<Actual1.ReactAsyncBatcher<number>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncBatcher']
	>
>;
type Entry1_ReactAsyncBatcherOptions = Assert<
	Equal<
		Omit<Actual1.ReactAsyncBatcherOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncBatcherOptions']
	>
>;
type Entry1_useAsyncBatchedCallback = Assert<
	Equal<
		ReturnType<typeof Actual1.useAsyncBatchedCallback<number>>,
		ExpectedContracts['useAsyncBatchedCallback']
	>
>;
type Entry1_useAsyncBatcher = Assert<
	Equal<
		Omit<ReturnType<typeof Actual1.useAsyncBatcher<number>>, 'Subscribe'>,
		ExpectedContracts['useAsyncBatcher']
	>
>;
Actual1.AsyncBatcher satisfies (typeof Expected1)['AsyncBatcher'];
type Entry1_AsyncBatcherOptions = Assert<
	Equal<Actual1.AsyncBatcherOptions<number>, ExpectedContracts['AsyncBatcherOptions']>
>;
type Entry1_AsyncBatcherState = Assert<
	Equal<Actual1.AsyncBatcherState<number>, ExpectedContracts['AsyncBatcherState']>
>;
Actual1.asyncBatch satisfies (typeof Expected1)['asyncBatch'];
Actual1.asyncBatcherOptions satisfies (typeof Expected1)['asyncBatcherOptions'];
import * as Actual2 from '@octanejs/tanstack-pacer/async-debouncer';
import * as Expected2 from '../../node_modules/@tanstack/react-pacer/dist/async-debouncer/index';
type Entry2_ReactAsyncDebouncer = Assert<
	Equal<
		Omit<Actual2.ReactAsyncDebouncer<AsyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncDebouncer']
	>
>;
type Entry2_ReactAsyncDebouncerOptions = Assert<
	Equal<
		Omit<Actual2.ReactAsyncDebouncerOptions<AsyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncDebouncerOptions']
	>
>;
type Entry2_useAsyncDebouncedCallback = Assert<
	Equal<
		ReturnType<typeof Actual2.useAsyncDebouncedCallback<AsyncWork>>,
		ExpectedContracts['useAsyncDebouncedCallback']
	>
>;
type Entry2_useAsyncDebouncer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual2.useAsyncDebouncer<AsyncWork>>, 'Subscribe'>,
		ExpectedContracts['useAsyncDebouncer']
	>
>;
Actual2.AsyncDebouncer satisfies (typeof Expected2)['AsyncDebouncer'];
type Entry2_AsyncDebouncerOptions = Assert<
	Equal<Actual2.AsyncDebouncerOptions<AsyncWork>, ExpectedContracts['AsyncDebouncerOptions']>
>;
type Entry2_AsyncDebouncerState = Assert<
	Equal<Actual2.AsyncDebouncerState<AsyncWork>, ExpectedContracts['AsyncDebouncerState']>
>;
Actual2.asyncDebounce satisfies (typeof Expected2)['asyncDebounce'];
Actual2.asyncDebouncerOptions satisfies (typeof Expected2)['asyncDebouncerOptions'];
import * as Actual3 from '@octanejs/tanstack-pacer/async-queuer';
import * as Expected3 from '../../node_modules/@tanstack/react-pacer/dist/async-queuer/index';
type Entry3_ReactAsyncQueuer = Assert<
	Equal<Omit<Actual3.ReactAsyncQueuer<number>, 'Subscribe'>, ExpectedContracts['ReactAsyncQueuer']>
>;
type Entry3_ReactAsyncQueuerOptions = Assert<
	Equal<
		Omit<Actual3.ReactAsyncQueuerOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncQueuerOptions']
	>
>;
type Entry3_useAsyncQueuedState = Assert<
	Equal<
		ReturnType<typeof Actual3.useAsyncQueuedState<number>>[0],
		ExpectedContracts['useAsyncQueuedState']
	>
>;
type Entry3_useAsyncQueuer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual3.useAsyncQueuer<number>>, 'Subscribe'>,
		ExpectedContracts['useAsyncQueuer']
	>
>;
Actual3.AsyncQueuer satisfies (typeof Expected3)['AsyncQueuer'];
type Entry3_AsyncQueuerOptions = Assert<
	Equal<Actual3.AsyncQueuerOptions<number>, ExpectedContracts['AsyncQueuerOptions']>
>;
type Entry3_AsyncQueuerState = Assert<
	Equal<Actual3.AsyncQueuerState<number>, ExpectedContracts['AsyncQueuerState']>
>;
Actual3.asyncQueue satisfies (typeof Expected3)['asyncQueue'];
Actual3.asyncQueuerOptions satisfies (typeof Expected3)['asyncQueuerOptions'];
import * as Actual4 from '@octanejs/tanstack-pacer/async-rate-limiter';
import * as Expected4 from '../../node_modules/@tanstack/react-pacer/dist/async-rate-limiter/index';
type Entry4_ReactAsyncRateLimiter = Assert<
	Equal<
		Omit<Actual4.ReactAsyncRateLimiter<AsyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncRateLimiter']
	>
>;
type Entry4_ReactAsyncRateLimiterOptions = Assert<
	Equal<
		Omit<Actual4.ReactAsyncRateLimiterOptions<AsyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncRateLimiterOptions']
	>
>;
type Entry4_useAsyncRateLimitedCallback = Assert<
	Equal<
		ReturnType<typeof Actual4.useAsyncRateLimitedCallback<AsyncWork>>,
		ExpectedContracts['useAsyncRateLimitedCallback']
	>
>;
type Entry4_useAsyncRateLimiter = Assert<
	Equal<
		Omit<ReturnType<typeof Actual4.useAsyncRateLimiter<AsyncWork>>, 'Subscribe'>,
		ExpectedContracts['useAsyncRateLimiter']
	>
>;
Actual4.AsyncRateLimiter satisfies (typeof Expected4)['AsyncRateLimiter'];
type Entry4_AsyncRateLimiterOptions = Assert<
	Equal<Actual4.AsyncRateLimiterOptions<AsyncWork>, ExpectedContracts['AsyncRateLimiterOptions']>
>;
type Entry4_AsyncRateLimiterState = Assert<
	Equal<Actual4.AsyncRateLimiterState<AsyncWork>, ExpectedContracts['AsyncRateLimiterState']>
>;
Actual4.asyncRateLimit satisfies (typeof Expected4)['asyncRateLimit'];
Actual4.asyncRateLimiterOptions satisfies (typeof Expected4)['asyncRateLimiterOptions'];
import * as Actual5 from '@octanejs/tanstack-pacer/async-retryer';
import * as Expected5 from '../../node_modules/@tanstack/react-pacer/dist/async-retryer/index';
Actual5.AsyncRetryer satisfies (typeof Expected5)['AsyncRetryer'];
type Entry5_AsyncRetryerOptions = Assert<
	Equal<Actual5.AsyncRetryerOptions<AsyncWork>, ExpectedContracts['AsyncRetryerOptions']>
>;
type Entry5_AsyncRetryerState = Assert<
	Equal<Actual5.AsyncRetryerState<AsyncWork>, ExpectedContracts['AsyncRetryerState']>
>;
Actual5.asyncRetry satisfies (typeof Expected5)['asyncRetry'];
Actual5.asyncRetryerOptions satisfies (typeof Expected5)['asyncRetryerOptions'];
import * as Actual6 from '@octanejs/tanstack-pacer/async-throttler';
import * as Expected6 from '../../node_modules/@tanstack/react-pacer/dist/async-throttler/index';
type Entry6_ReactAsyncThrottler = Assert<
	Equal<
		Omit<Actual6.ReactAsyncThrottler<AsyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactAsyncThrottler']
	>
>;
type Entry6_ReactAsyncThrottlerOptions = Assert<
	Equal<
		Omit<Actual6.ReactAsyncThrottlerOptions<AsyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactAsyncThrottlerOptions']
	>
>;
type Entry6_useAsyncThrottledCallback = Assert<
	Equal<
		ReturnType<typeof Actual6.useAsyncThrottledCallback<AsyncWork>>,
		ExpectedContracts['useAsyncThrottledCallback']
	>
>;
type Entry6_useAsyncThrottler = Assert<
	Equal<
		Omit<ReturnType<typeof Actual6.useAsyncThrottler<AsyncWork>>, 'Subscribe'>,
		ExpectedContracts['useAsyncThrottler']
	>
>;
Actual6.AsyncThrottler satisfies (typeof Expected6)['AsyncThrottler'];
type Entry6_AsyncThrottlerOptions = Assert<
	Equal<Actual6.AsyncThrottlerOptions<AsyncWork>, ExpectedContracts['AsyncThrottlerOptions']>
>;
type Entry6_AsyncThrottlerState = Assert<
	Equal<Actual6.AsyncThrottlerState<AsyncWork>, ExpectedContracts['AsyncThrottlerState']>
>;
Actual6.asyncThrottle satisfies (typeof Expected6)['asyncThrottle'];
Actual6.asyncThrottlerOptions satisfies (typeof Expected6)['asyncThrottlerOptions'];
import * as Actual7 from '@octanejs/tanstack-pacer/batcher';
import * as Expected7 from '../../node_modules/@tanstack/react-pacer/dist/batcher/index';
type Entry7_ReactBatcher = Assert<
	Equal<Omit<Actual7.ReactBatcher<number>, 'Subscribe'>, ExpectedContracts['ReactBatcher']>
>;
type Entry7_ReactBatcherOptions = Assert<
	Equal<
		Omit<Actual7.ReactBatcherOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactBatcherOptions']
	>
>;
type Entry7_useBatchedCallback = Assert<
	Equal<
		ReturnType<typeof Actual7.useBatchedCallback<number>>,
		ExpectedContracts['useBatchedCallback']
	>
>;
type Entry7_useBatcher = Assert<
	Equal<
		Omit<ReturnType<typeof Actual7.useBatcher<number>>, 'Subscribe'>,
		ExpectedContracts['useBatcher']
	>
>;
Actual7.Batcher satisfies (typeof Expected7)['Batcher'];
type Entry7_BatcherOptions = Assert<
	Equal<Actual7.BatcherOptions<number>, ExpectedContracts['BatcherOptions']>
>;
type Entry7_BatcherState = Assert<
	Equal<Actual7.BatcherState<number>, ExpectedContracts['BatcherState']>
>;
Actual7.batch satisfies (typeof Expected7)['batch'];
import * as Actual8 from '@octanejs/tanstack-pacer/debouncer';
import * as Expected8 from '../../node_modules/@tanstack/react-pacer/dist/debouncer/index';
type Entry8_ReactDebouncer = Assert<
	Equal<Omit<Actual8.ReactDebouncer<SyncWork>, 'Subscribe'>, ExpectedContracts['ReactDebouncer']>
>;
type Entry8_ReactDebouncerOptions = Assert<
	Equal<
		Omit<Actual8.ReactDebouncerOptions<SyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactDebouncerOptions']
	>
>;
type Entry8_useDebouncedCallback = Assert<
	Equal<
		ReturnType<typeof Actual8.useDebouncedCallback<SyncWork>>,
		ExpectedContracts['useDebouncedCallback']
	>
>;
type Entry8_useDebouncedState = Assert<
	Equal<
		ReturnType<typeof Actual8.useDebouncedState<number>>[0],
		ExpectedContracts['useDebouncedState']
	>
>;
type Entry8_useDebouncedValue = Assert<
	Equal<
		ReturnType<typeof Actual8.useDebouncedValue<number>>[0],
		ExpectedContracts['useDebouncedValue']
	>
>;
type Entry8_useDebouncer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual8.useDebouncer<SyncWork>>, 'Subscribe'>,
		ExpectedContracts['useDebouncer']
	>
>;
Actual8.Debouncer satisfies (typeof Expected8)['Debouncer'];
type Entry8_DebouncerOptions = Assert<
	Equal<Actual8.DebouncerOptions<SyncWork>, ExpectedContracts['DebouncerOptions']>
>;
type Entry8_DebouncerState = Assert<
	Equal<Actual8.DebouncerState<SyncWork>, ExpectedContracts['DebouncerState']>
>;
Actual8.debounce satisfies (typeof Expected8)['debounce'];
Actual8.debouncerOptions satisfies (typeof Expected8)['debouncerOptions'];
import * as Actual9 from '@octanejs/tanstack-pacer/provider';
import * as Expected9 from '../../node_modules/@tanstack/react-pacer/dist/provider/index';
type Entry9_PacerProvider = Assert<
	Equal<
		Omit<Parameters<typeof Actual9.PacerProvider>[0], 'children'>,
		ExpectedContracts['PacerProvider']
	>
>;
type Entry9_PacerProviderOptions = Assert<
	Equal<Actual9.PacerProviderOptions, ExpectedContracts['PacerProviderOptions']>
>;
type Entry9_PacerProviderProps = Assert<
	Equal<Omit<Actual9.PacerProviderProps, 'children'>, ExpectedContracts['PacerProviderProps']>
>;
type Entry9_useDefaultPacerOptions = Assert<
	Equal<
		ReturnType<typeof Actual9.useDefaultPacerOptions>,
		ExpectedContracts['useDefaultPacerOptions']
	>
>;
type Entry9_usePacerContext = Assert<
	Equal<ReturnType<typeof Actual9.usePacerContext>, ExpectedContracts['usePacerContext']>
>;
import * as Actual10 from '@octanejs/tanstack-pacer/queuer';
import * as Expected10 from '../../node_modules/@tanstack/react-pacer/dist/queuer/index';
type Entry10_ReactQueuer = Assert<
	Equal<Omit<Actual10.ReactQueuer<number>, 'Subscribe'>, ExpectedContracts['ReactQueuer']>
>;
type Entry10_ReactQueuerOptions = Assert<
	Equal<
		Omit<Actual10.ReactQueuerOptions<number>, 'onUnmount'>,
		ExpectedContracts['ReactQueuerOptions']
	>
>;
type Entry10_useQueuedState = Assert<
	Equal<ReturnType<typeof Actual10.useQueuedState<number>>[0], ExpectedContracts['useQueuedState']>
>;
type Entry10_useQueuedValue = Assert<
	Equal<ReturnType<typeof Actual10.useQueuedValue<number>>[0], ExpectedContracts['useQueuedValue']>
>;
type Entry10_useQueuer = Assert<
	Equal<
		Omit<ReturnType<typeof Actual10.useQueuer<number>>, 'Subscribe'>,
		ExpectedContracts['useQueuer']
	>
>;
type Entry10_QueuePosition = Assert<
	Equal<Actual10.QueuePosition, ExpectedContracts['QueuePosition']>
>;
Actual10.Queuer satisfies (typeof Expected10)['Queuer'];
type Entry10_QueuerOptions = Assert<
	Equal<Actual10.QueuerOptions<number>, ExpectedContracts['QueuerOptions']>
>;
type Entry10_QueuerState = Assert<
	Equal<Actual10.QueuerState<number>, ExpectedContracts['QueuerState']>
>;
Actual10.queue satisfies (typeof Expected10)['queue'];
Actual10.queuerOptions satisfies (typeof Expected10)['queuerOptions'];
import * as Actual11 from '@octanejs/tanstack-pacer/rate-limiter';
import * as Expected11 from '../../node_modules/@tanstack/react-pacer/dist/rate-limiter/index';
type Entry11_ReactRateLimiter = Assert<
	Equal<
		Omit<Actual11.ReactRateLimiter<SyncWork>, 'Subscribe'>,
		ExpectedContracts['ReactRateLimiter']
	>
>;
type Entry11_ReactRateLimiterOptions = Assert<
	Equal<
		Omit<Actual11.ReactRateLimiterOptions<SyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactRateLimiterOptions']
	>
>;
type Entry11_useRateLimitedCallback = Assert<
	Equal<
		ReturnType<typeof Actual11.useRateLimitedCallback<SyncWork>>,
		ExpectedContracts['useRateLimitedCallback']
	>
>;
type Entry11_useRateLimitedState = Assert<
	Equal<
		ReturnType<typeof Actual11.useRateLimitedState<number>>[0],
		ExpectedContracts['useRateLimitedState']
	>
>;
type Entry11_useRateLimitedValue = Assert<
	Equal<
		ReturnType<typeof Actual11.useRateLimitedValue<number>>[0],
		ExpectedContracts['useRateLimitedValue']
	>
>;
type Entry11_useRateLimiter = Assert<
	Equal<
		Omit<ReturnType<typeof Actual11.useRateLimiter<SyncWork>>, 'Subscribe'>,
		ExpectedContracts['useRateLimiter']
	>
>;
Actual11.RateLimiter satisfies (typeof Expected11)['RateLimiter'];
type Entry11_RateLimiterOptions = Assert<
	Equal<Actual11.RateLimiterOptions<SyncWork>, ExpectedContracts['RateLimiterOptions']>
>;
type Entry11_RateLimiterState = Assert<
	Equal<Actual11.RateLimiterState, ExpectedContracts['RateLimiterState']>
>;
Actual11.rateLimit satisfies (typeof Expected11)['rateLimit'];
Actual11.rateLimiterOptions satisfies (typeof Expected11)['rateLimiterOptions'];
import * as Actual12 from '@octanejs/tanstack-pacer/throttler';
import * as Expected12 from '../../node_modules/@tanstack/react-pacer/dist/throttler/index';
type Entry12_ReactThrottler = Assert<
	Equal<Omit<Actual12.ReactThrottler<SyncWork>, 'Subscribe'>, ExpectedContracts['ReactThrottler']>
>;
type Entry12_ReactThrottlerOptions = Assert<
	Equal<
		Omit<Actual12.ReactThrottlerOptions<SyncWork>, 'onUnmount'>,
		ExpectedContracts['ReactThrottlerOptions']
	>
>;
type Entry12_useThrottledCallback = Assert<
	Equal<
		ReturnType<typeof Actual12.useThrottledCallback<SyncWork>>,
		ExpectedContracts['useThrottledCallback']
	>
>;
type Entry12_useThrottledState = Assert<
	Equal<
		ReturnType<typeof Actual12.useThrottledState<number>>[0],
		ExpectedContracts['useThrottledState']
	>
>;
type Entry12_useThrottledValue = Assert<
	Equal<
		ReturnType<typeof Actual12.useThrottledValue<number>>[0],
		ExpectedContracts['useThrottledValue']
	>
>;
type Entry12_useThrottler = Assert<
	Equal<
		Omit<ReturnType<typeof Actual12.useThrottler<SyncWork>>, 'Subscribe'>,
		ExpectedContracts['useThrottler']
	>
>;
Actual12.Throttler satisfies (typeof Expected12)['Throttler'];
type Entry12_ThrottlerOptions = Assert<
	Equal<Actual12.ThrottlerOptions<SyncWork>, ExpectedContracts['ThrottlerOptions']>
>;
type Entry12_ThrottlerState = Assert<
	Equal<Actual12.ThrottlerState<SyncWork>, ExpectedContracts['ThrottlerState']>
>;
Actual12.throttle satisfies (typeof Expected12)['throttle'];
Actual12.throttlerOptions satisfies (typeof Expected12)['throttlerOptions'];
import * as Actual13 from '@octanejs/tanstack-pacer/types';
import * as Expected13 from '../../node_modules/@tanstack/react-pacer/dist/types/index';
type Entry13_AnyAsyncFunction = Assert<
	Equal<Actual13.AnyAsyncFunction, ExpectedContracts['AnyAsyncFunction']>
>;
type Entry13_AnyFunction = Assert<Equal<Actual13.AnyFunction, ExpectedContracts['AnyFunction']>>;
type Entry13_OptionalKeys = Assert<
	Equal<Actual13.OptionalKeys<{ value: number }, 'value'>, ExpectedContracts['OptionalKeys']>
>;
import * as Actual14 from '@octanejs/tanstack-pacer/utils';
import * as Expected14 from '../../node_modules/@tanstack/react-pacer/dist/utils/index';
Actual14.isFunction satisfies (typeof Expected14)['isFunction'];
Actual14.parseFunctionOrValue satisfies (typeof Expected14)['parseFunctionOrValue'];
// @ts-expect-error Async callback arguments retain their numeric input type.
Actual0.useAsyncDebouncedCallback(async (value: number) => value, { wait: 10 })('wrong');
