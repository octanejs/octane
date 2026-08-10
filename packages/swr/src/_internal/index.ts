import SWRConfig from './utils/config-context.js';
import * as revalidateEvents from './events.js';
import { INFINITE_PREFIX } from './constants.js';

export { SWRConfig, revalidateEvents, INFINITE_PREFIX };

export { initCache } from './utils/cache.js';
export { defaultConfig, cache, mutate, compare } from './utils/config.js';
import { setupDevTools } from './utils/devtools.js';
export * from './utils/env.js';
export { SWRGlobalState } from './utils/global-state.js';
export { stableHash } from './utils/hash.js';
export * from './utils/helper.js';
export * from './utils/shared.js';
export { mergeConfigs } from './utils/merge-config.js';
export { internalMutate } from './utils/mutate.js';
export { normalize } from './utils/normalize-args.js';
export { withArgs } from './utils/resolve-args.js';
export { serialize } from './utils/serialize.js';
export { subscribeCallback } from './utils/subscribe-key.js';
export { getTimestamp } from './utils/timestamp.js';
export { useSWRConfig } from './utils/use-swr-config.js';
export { preset, defaultConfigOptions } from './utils/web-preset.js';
export { withMiddleware } from './utils/with-middleware.js';
export { preload } from './utils/preload.js';

export * from './types.js';

setupDevTools();
