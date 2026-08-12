import type { Middleware } from '../_internal/index.js';
import type { SWRInfiniteHook } from './types.js';

declare const useSWRInfinite: SWRInfiniteHook;
export default useSWRInfinite;
export declare const infinite: Middleware;
export { unstable_serialize } from './serialize.js';
export type {
	SWRInfiniteConfiguration,
	SWRInfiniteResponse,
	SWRInfiniteHook,
	SWRInfiniteKeyLoader,
	SWRInfiniteFetcher,
	SWRInfiniteCompareFn,
	SWRInfiniteKeyedMutator,
	SWRInfiniteMutatorOptions,
} from './types.js';
