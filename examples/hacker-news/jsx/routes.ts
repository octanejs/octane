// React (.tsx) route wiring: feed the shared route-structure factory the
// React-style view components (+ per-route Suspense skeletons).
import { createAppRouter, type RouterEnv } from '../shared/routes.js';
import { RootLayout } from './RootLayout.js';
import { StoriesPage } from './StoriesPage.js';
import { ItemPage } from './ItemPage.js';
import { UserPage } from './UserPage.js';
import { NotFound } from './NotFound.js';
import { StoriesPending, ItemPending, UserPending } from './Pending.js';

const components = {
	RootLayout,
	StoriesPage,
	ItemPage,
	UserPage,
	NotFound,
	StoriesPending,
	ItemPending,
	UserPending,
};

// Build a router for a given environment. Server passes a memory history +
// isServer:true (see entry-server); client passes nothing (browser history).
// Each SSR request must build a FRESH router (per-request location), so this is
// a factory rather than a singleton.
export function makeRouter(env: RouterEnv = {}) {
	return createAppRouter(components, env);
}

// The browser singleton — used by the client App when not hydrating via the
// entry-client factory. Kept for back-compat with the old client-only entry.
export const router = makeRouter();
