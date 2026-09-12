import {
	useAsyncDebouncedCallback,
	useAsyncRateLimitedCallback,
	useAsyncThrottledCallback,
} from '@octanejs/tanstack-pacer';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions.js';
type Work = (value: number, label: string) => Promise<number>;
type Callback = (value: number, label: string) => Promise<number | undefined>;
type DebounceResult = Assert<Equal<ReturnType<typeof useAsyncDebouncedCallback<Work>>, Callback>>;
type LimitResult = Assert<Equal<ReturnType<typeof useAsyncRateLimitedCallback<Work>>, Callback>>;
type ThrottleResult = Assert<Equal<ReturnType<typeof useAsyncThrottledCallback<Work>>, Callback>>;
declare const debounced: ReturnType<typeof useAsyncDebouncedCallback<Work>>;
declare const limited: ReturnType<typeof useAsyncRateLimitedCallback<Work>>;
declare const throttled: ReturnType<typeof useAsyncThrottledCallback<Work>>;
const value: Promise<number | undefined> = debounced(1, 'value');
// @ts-expect-error Disabled callback results include undefined.
const required: Promise<number> = debounced(1, 'value');
// @ts-expect-error Callback argument types are preserved.
limited('wrong', 'value');
// @ts-expect-error Callback arity is preserved.
throttled(1);
