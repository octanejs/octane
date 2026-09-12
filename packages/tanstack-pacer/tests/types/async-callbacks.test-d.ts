import {
	useAsyncDebouncedCallback,
	useAsyncRateLimitedCallback,
	useAsyncThrottledCallback,
} from '@octanejs/tanstack-pacer';
import { useAsyncDebouncedCallback as subpathDebounce } from '@octanejs/tanstack-pacer/async-debouncer';
import { useAsyncRateLimitedCallback as subpathLimit } from '@octanejs/tanstack-pacer/async-rate-limiter';
import { useAsyncThrottledCallback as subpathThrottle } from '@octanejs/tanstack-pacer/async-throttler';

import type { Assert as Expect, Equal } from '../../../../scripts/react-port/type-assertions.js';

type Work = (value: number, label: string) => Promise<number>;
type Callback = (value: number, label: string) => Promise<number | undefined>;

type DebounceResult = Expect<Equal<ReturnType<typeof useAsyncDebouncedCallback<Work>>, Callback>>;
type LimitResult = Expect<Equal<ReturnType<typeof useAsyncRateLimitedCallback<Work>>, Callback>>;
type ThrottleResult = Expect<Equal<ReturnType<typeof useAsyncThrottledCallback<Work>>, Callback>>;
type DebounceEntry = Expect<Equal<typeof useAsyncDebouncedCallback, typeof subpathDebounce>>;
type LimitEntry = Expect<Equal<typeof useAsyncRateLimitedCallback, typeof subpathLimit>>;
type ThrottleEntry = Expect<Equal<typeof useAsyncThrottledCallback, typeof subpathThrottle>>;

declare const debounced: ReturnType<typeof useAsyncDebouncedCallback<Work>>;
declare const limited: ReturnType<typeof useAsyncRateLimitedCallback<Work>>;
declare const throttled: ReturnType<typeof useAsyncThrottledCallback<Work>>;
const acceptsDebounced: Promise<number | undefined> = debounced(1, 'query');
const acceptsLimited: Promise<number | undefined> = limited(1, 'query');
const acceptsThrottled: Promise<number | undefined> = throttled(1, 'query');
// @ts-expect-error A suppressed execution may resolve with undefined.
const rejectsMissingUndefined: Promise<number> = debounced(1, 'query');
// @ts-expect-error Callback argument types are preserved.
limited('wrong', 'query');
// @ts-expect-error Callback arity is preserved.
throttled(1);
// @ts-expect-error Awaiting the callback never yields a nested promise.
const rejectsNestedPromise: Promise<Promise<number>> = throttled(1, 'query');
