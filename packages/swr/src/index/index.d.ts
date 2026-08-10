import type { SWRConfigProps } from '../_internal/utils/config-context.js';
import type { FullConfiguration, Key, SWRHook } from '../_internal/index.js';

declare const useSWR: SWRHook;
export default useSWR;
export declare const SWRConfig: ((props: SWRConfigProps) => unknown) & {
	defaultValue: FullConfiguration;
};
export declare const unstable_serialize: (key: Key) => string;
export declare const useSWRConfig: () => FullConfiguration;
export { mutate, preload } from '../_internal/index.js';
export type {
	SWRConfiguration,
	Revalidator,
	RevalidatorOptions,
	Key,
	KeyLoader,
	KeyedMutator,
	SWRHook,
	SWRResponse,
	Cache,
	BareFetcher,
	Fetcher,
	MutatorCallback,
	MutatorOptions,
	Middleware,
	Arguments,
	State,
	ScopedMutator,
} from '../_internal/index.js';
