// The runtime's entries that can drop a render: a suspension (use, lazy,
// Suspense and @pending, Hydrate, renderer regions) or a ViewTransition hold.
// A bundle that keeps any of them installs the root render journal as this
// module loads, before its first render can need it (installRootRollback).
// Hydration, native reads and ViewTransition also install it from their own
// entry points. A bundler keeps this module's load-time call only with a
// binding the module itself declares, never with a re-export, so each entry is
// a local alias of the runtime's own function.
import { installRootRollback } from './runtime/drivers.js';
import { useBatch as runtimeUseBatch } from './runtime/use.js';
import {
	use as runtimeUse,
	useRendererThenable as runtimeUseRendererThenable,
	bindRendererRegionOwner as runtimeBindRendererRegionOwner,
} from './runtime/context.js';
import {
	Hydrate as RuntimeHydrate,
	__HydrateCompiled as RuntimeHydrateCompiled,
} from './runtime/hydrate-boundary.js';
import {
	Suspense as RuntimeSuspense,
	ViewTransition as RuntimeViewTransition,
	tryBlock as runtimeTryBlock,
} from './runtime/suspense.js';
import { lazy as runtimeLazy } from './runtime/component-slots.js';

installRootRollback();

export const useBatch: typeof runtimeUseBatch = runtimeUseBatch;
export const use: typeof runtimeUse = runtimeUse;
export const useRendererThenable: typeof runtimeUseRendererThenable = runtimeUseRendererThenable;
export const bindRendererRegionOwner: typeof runtimeBindRendererRegionOwner =
	runtimeBindRendererRegionOwner;
export const Hydrate: typeof RuntimeHydrate = RuntimeHydrate;
export const __HydrateCompiled: typeof RuntimeHydrateCompiled = RuntimeHydrateCompiled;
export const Suspense: typeof RuntimeSuspense = RuntimeSuspense;
export const ViewTransition: typeof RuntimeViewTransition = RuntimeViewTransition;
export const tryBlock: typeof runtimeTryBlock = runtimeTryBlock;
export const lazy: typeof runtimeLazy = runtimeLazy;
