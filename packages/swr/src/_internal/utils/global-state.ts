import type { Cache, GlobalState } from '../types.js';

// Global state used to deduplicate requests and store listeners
export const SWRGlobalState = new WeakMap<Cache, GlobalState>();
