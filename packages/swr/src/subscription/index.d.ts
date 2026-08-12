import type { Middleware } from '../_internal/index.js';
import type { SWRSubscriptionHook } from './types.js';

declare const useSWRSubscription: SWRSubscriptionHook;
export default useSWRSubscription;
export declare const subscription: Middleware;
export type {
	SWRSubscription,
	SWRSubscriptionOptions,
	SWRSubscriptionResponse,
	SWRSubscriptionHook,
} from './types.js';
