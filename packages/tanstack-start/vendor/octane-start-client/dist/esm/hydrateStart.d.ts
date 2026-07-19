import { AnyRouter } from '@tanstack/router-core';
/**
 * Octane batches router store writes in a transition. The core hydration
 * promise can therefore settle before the hydrated matches are observable to
 * the first render. Wait for that commit so hydrateRoot never adopts the
 * server document with an empty match tree.
 */
export declare function waitForRouterMatches(router: AnyRouter): Promise<void>;
export declare function hydrateStart(): Promise<AnyRouter>;
