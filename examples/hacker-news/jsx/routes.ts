// React (.tsx) route wiring: feed the shared route-structure factory the
// React-style view components (+ per-route Suspense skeletons).
import { createAppRouter } from '../shared/routes.js';
import { RootLayout } from './RootLayout.js';
import { StoriesPage } from './StoriesPage.js';
import { ItemPage } from './ItemPage.js';
import { UserPage } from './UserPage.js';
import { NotFound } from './NotFound.js';
import { StoriesPending, ItemPending, UserPending } from './Pending.js';

export const router = createAppRouter({
	RootLayout,
	StoriesPage,
	ItemPage,
	UserPage,
	NotFound,
	StoriesPending,
	ItemPending,
	UserPending,
});
