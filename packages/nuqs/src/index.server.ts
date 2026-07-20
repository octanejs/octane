// `@octanejs/nuqs/server` — the server-safe surface: parsers, serializer and
// loader for reading/writing search params outside of a component (SSR data
// loading, link building, tests). It ships NONE of the octane hooks, so it is
// safe to import from server-only modules.
//
// DIVERGENCE FROM nuqs/server: `createSearchParamsCache` is NOT exported. It is
// built on React Server Components' `React.cache()`, which octane does not
// implement (no Server Components — see octane's "differences from React").
// Use `createLoader` for equivalent request-scoped parsing.
import './debug';

export type { HistoryOptions, Nullable, Options, SearchParams, UrlKeys } from './defs';
export { debounce, defaultRateLimit, throttle } from './lib/queues/rate-limiting';
export {
	createLoader,
	type LoaderFunction,
	type LoaderInput,
	type LoaderOptions,
	type CreateLoaderOptions,
} from './loader';
export * from './parsers';
export { createSerializer, type CreateSerializerOptions } from './serializer';
export { createStandardSchemaV1, type CreateStandardSchemaV1Options } from './standard-schema';
