// re-export everything from the core pacer package
export * from '@tanstack/pacer'

// provider
export * from './provider/PacerProvider'

/**
 * Export every hook individually - DON'T export from barrel files
 */

// async-batcher
export * from './async-batcher/useAsyncBatcher'
export * from './async-batcher/useAsyncBatchedCallback'

// async-debouncer
export * from './async-debouncer/useAsyncDebouncer'
export * from './async-debouncer/useAsyncDebouncedCallback'

// async-queuer
export * from './async-queuer/useAsyncQueuer'
export * from './async-queuer/useAsyncQueuedState'

// async-rate-limiter
export * from './async-rate-limiter/useAsyncRateLimiter'
export * from './async-rate-limiter/useAsyncRateLimitedCallback'

// async-throttler
export * from './async-throttler/useAsyncThrottler'
export * from './async-throttler/useAsyncThrottledCallback'

// batcher
export * from './batcher/useBatcher'
export * from './batcher/useBatchedCallback'

// debouncer
export * from './debouncer/useDebouncedCallback'
export * from './debouncer/useDebouncedState'
export * from './debouncer/useDebouncedValue'
export * from './debouncer/useDebouncer'

// queuer
export * from './queuer/useQueuer'
export * from './queuer/useQueuedState'
export * from './queuer/useQueuedValue'

// rate-limiter
export * from './rate-limiter/useRateLimitedCallback'
export * from './rate-limiter/useRateLimiter'
export * from './rate-limiter/useRateLimitedState'
export * from './rate-limiter/useRateLimitedValue'

// throttler
export * from './throttler/useThrottledCallback'
export * from './throttler/useThrottledState'
export * from './throttler/useThrottledValue'
export * from './throttler/useThrottler'
