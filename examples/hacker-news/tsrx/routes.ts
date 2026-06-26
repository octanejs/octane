// TSRX (.tsrx) route wiring: feed the shared route-structure factory the
// TSRX view components (+ per-route Suspense skeletons).
import { createAppRouter } from '../shared/routes.js';
import { RootLayout } from './RootLayout.tsrx';
import { StoriesPage } from './StoriesPage.tsrx';
import { ItemPage } from './ItemPage.tsrx';
import { UserPage } from './UserPage.tsrx';
import { NotFound } from './NotFound.tsrx';
import { StoriesPending, ItemPending, UserPending } from './Pending.tsrx';

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
