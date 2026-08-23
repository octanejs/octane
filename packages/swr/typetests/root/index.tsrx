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
	const response = useSWR(['user', 1] as const, async (key) => {
		const tuple: readonly ['user', 1] = key;
		// @ts-expect-error tuple keys infer the complete tuple for the fetcher.
		const stringKey: string = key;
		void stringKey;
		return `${tuple[0]}-${tuple[1]}`;
	});
	const data: string | undefined = response.data;
	// @ts-expect-error the inferred fetcher result is string, not number or any.
	const numericData: number | undefined = response.data;
	const bound: KeyedMutator<string> = response.mutate;
	const config = useSWRConfig();
	void [data, numericData, bound, config, mutate, preload, unstable_serialize, SWRConfig];
}

type RootTypes =
	[Arguments, BareFetcher, Cache, Fetcher, Key, KeyLoader, Middleware, MutatorCallback, MutatorOptions, Revalidator, RevalidatorOptions, ScopedMutator, State, SWRConfiguration, SWRHook, SWRResponse];
declare const rootTypes: RootTypes;
void rootTypes;

// SWR's BareFetcher overload intentionally accepts explicitly annotated fetchers.
useSWR(['user', 1] as const, async (key: string) => key);
