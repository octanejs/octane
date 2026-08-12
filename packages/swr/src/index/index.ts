// useSWR
import useSWR from './use-swr.js';
export default useSWR;
// Core APIs
export { SWRConfig } from './use-swr.js';
export { unstable_serialize } from './serialize.js';
export { useSWRConfig } from '../_internal/index.js';
export { mutate } from '../_internal/index.js';
export { preload } from '../_internal/index.js';

// Config

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SWRGlobalConfig {
	// suspense: true
}

// Types
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
