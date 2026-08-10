import useSWR, {
	SWRConfig,
	mutate,
	preload,
	unstable_serialize,
	useSWRConfig,
	type Arguments,
	type BareFetcher,
	type Cache,
	type Fetcher,
	type Key,
	type KeyedMutator,
	type KeyLoader,
	type Middleware,
	type MutatorCallback,
	type MutatorOptions,
	type Revalidator,
	type RevalidatorOptions,
	type ScopedMutator,
	type State,
	type SWRConfiguration,
	type SWRHook,
	type SWRResponse,
} from '../../src/index/index';

export function RootTypeConsumer() @{
	const response = useSWR(['user', 1] as const, async ([kind, id]) => `${kind}-${id}`);
	const data: string | undefined = response.data;
	const bound: KeyedMutator<string> = response.mutate;
	const config = useSWRConfig();
	void [data, bound, config, mutate, preload, unstable_serialize, SWRConfig];
}

type RootTypes =
	[Arguments, BareFetcher, Cache, Fetcher, Key, KeyLoader, Middleware, MutatorCallback, MutatorOptions, Revalidator, RevalidatorOptions, ScopedMutator, State, SWRConfiguration, SWRHook, SWRResponse];
declare const rootTypes: RootTypes;
void rootTypes;

// @ts-expect-error tuple keys infer the complete tuple for the fetcher.
useSWR(['user', 1] as const, async (key: string) => key);
