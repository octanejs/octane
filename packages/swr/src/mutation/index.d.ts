import type { SWRMutationHook } from './types.js';

declare const useSWRMutation: SWRMutationHook;
export default useSWRMutation;
export type {
	SWRMutationConfiguration,
	SWRMutationResponse,
	SWRMutationHook,
	MutationFetcher,
	TriggerWithArgs,
	TriggerWithoutArgs,
	TriggerWithOptionsArgs,
} from './types.js';
