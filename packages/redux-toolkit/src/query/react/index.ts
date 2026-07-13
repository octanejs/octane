import { buildCreateApi, coreModule } from '@reduxjs/toolkit/query';
import { reactHooksModule, reactHooksModuleName } from './module';

export * from '@reduxjs/toolkit/query';
export { ApiProvider } from './ApiProvider.tsrx';

const createApi = /* @__PURE__ */ buildCreateApi(coreModule(), reactHooksModule());

export type {
	TypedUseMutationResult,
	TypedUseQueryHookResult,
	TypedUseQueryStateResult,
	TypedUseQuerySubscriptionResult,
	TypedLazyQueryTrigger,
	TypedUseLazyQuery,
	TypedUseMutation,
	TypedMutationTrigger,
	TypedQueryStateSelector,
	TypedUseQueryState,
	TypedUseQuery,
	TypedUseQuerySubscription,
	TypedUseLazyQuerySubscription,
	TypedUseQueryStateOptions,
	TypedUseLazyQueryStateResult,
	TypedUseInfiniteQuery,
	TypedUseInfiniteQueryHookResult,
	TypedUseInfiniteQueryStateResult,
	TypedUseInfiniteQuerySubscriptionResult,
	TypedUseInfiniteQueryStateOptions,
	TypedInfiniteQueryStateSelector,
	TypedUseInfiniteQuerySubscription,
	TypedUseInfiniteQueryState,
	TypedLazyInfiniteQueryTrigger,
	TypedUseQuerySubscriptionOptions,
	TypedUseMutationStateOptions,
} from './buildHooks';
export { UNINITIALIZED_VALUE } from './constants';
export { createApi, reactHooksModule, reactHooksModuleName };
