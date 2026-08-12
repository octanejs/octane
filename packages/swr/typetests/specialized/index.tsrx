import useSWRImmutable from '../../src/immutable/index';
import useSWRInfinite, {
	type SWRInfiniteCompareFn,
	type SWRInfiniteConfiguration,
	type SWRInfiniteFetcher,
	type SWRInfiniteHook,
	type SWRInfiniteKeyedMutator,
	type SWRInfiniteKeyLoader,
	type SWRInfiniteMutatorOptions,
	type SWRInfiniteResponse,
} from '../../src/infinite/index';
import useSWRMutation, {
	type MutationFetcher,
	type SWRMutationConfiguration,
	type SWRMutationHook,
	type SWRMutationResponse,
	type TriggerWithArgs,
	type TriggerWithoutArgs,
	type TriggerWithOptionsArgs,
} from '../../src/mutation/index';
import useSWRSubscription, {
	type SWRSubscription,
	type SWRSubscriptionHook,
	type SWRSubscriptionOptions,
	type SWRSubscriptionResponse,
} from '../../src/subscription/index';

export function SpecializedTypeConsumer() @{
	const immutable = useSWRImmutable('immutable', async (key) => key.length);
	const infinite = useSWRInfinite((index) => ['page', index] as const, async ([, index]) => index);
	const mutation = useSWRMutation('mutation', async (_key, { arg }: { arg: number }) => arg + 1);
	const subscription = useSWRSubscription('events', (_key, { next }) => {
		next(undefined, 1);
		return () => undefined;
	});
	void [immutable, infinite, mutation, subscription];
}

type SpecializedTypes =
	[SWRInfiniteCompareFn<
		any
	>, SWRInfiniteConfiguration, SWRInfiniteFetcher, SWRInfiniteHook, SWRInfiniteKeyedMutator<
		any
	>, SWRInfiniteKeyLoader, SWRInfiniteMutatorOptions, SWRInfiniteResponse, MutationFetcher, SWRMutationConfiguration<
		any,
		any
	>, SWRMutationHook, SWRMutationResponse, TriggerWithArgs<any, any, any, any>, TriggerWithoutArgs<
		any,
		any,
		any
	>, TriggerWithOptionsArgs<any, any, any, any>, SWRSubscription<
		any,
		any,
		any
	>, SWRSubscriptionHook, SWRSubscriptionOptions<any, any>, SWRSubscriptionResponse];
declare const specializedTypes: SpecializedTypes;
void specializedTypes;
