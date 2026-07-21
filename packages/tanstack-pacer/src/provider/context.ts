import { createContext, useContext } from 'octane';
import type {
	AnyAsyncFunction,
	AnyFunction,
	AsyncBatcherOptions,
	AsyncDebouncerOptions,
	AsyncQueuerOptions,
	AsyncRateLimiterOptions,
	AsyncThrottlerOptions,
	BatcherOptions,
	DebouncerOptions,
	QueuerOptions,
	RateLimiterOptions,
	ThrottlerOptions,
} from '@tanstack/pacer';

export interface PacerProviderOptions {
	asyncBatcher?: Partial<AsyncBatcherOptions<any>>;
	asyncDebouncer?: Partial<AsyncDebouncerOptions<AnyAsyncFunction>>;
	asyncQueuer?: Partial<AsyncQueuerOptions<any>>;
	asyncRateLimiter?: Partial<AsyncRateLimiterOptions<AnyAsyncFunction>>;
	asyncThrottler?: Partial<AsyncThrottlerOptions<AnyAsyncFunction>>;
	batcher?: Partial<BatcherOptions<any>>;
	debouncer?: Partial<DebouncerOptions<AnyFunction>>;
	queuer?: Partial<QueuerOptions<any>>;
	rateLimiter?: Partial<RateLimiterOptions<AnyFunction>>;
	throttler?: Partial<ThrottlerOptions<AnyFunction>>;
}

export interface PacerContextValue {
	defaultOptions: PacerProviderOptions;
}

export const PacerContext = createContext<PacerContextValue | null>(null);

export function usePacerContext() {
	return useContext(PacerContext);
}

export function useDefaultPacerOptions() {
	const context = useContext(PacerContext);
	return context?.defaultOptions ?? {};
}
