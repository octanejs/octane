import type { AnyRouter } from '@tanstack/router-core';

export declare function waitForRouterMatches(router: AnyRouter): Promise<void>;
export declare function hydrateStart(): Promise<AnyRouter>;
