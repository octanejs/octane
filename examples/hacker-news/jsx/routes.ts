// React (.tsx) route wiring: feed the shared route-structure factory the
// React-style view components (+ per-route Suspense skeletons).
import { createAppRouter } from '../shared/routes.ts';
import { RootLayout } from './RootLayout.tsx';
import { StoriesPage } from './StoriesPage.tsx';
import { ItemPage } from './ItemPage.tsx';
import { UserPage } from './UserPage.tsx';
import { NotFound } from './NotFound.tsx';
import { StoriesPending, ItemPending, UserPending } from './Pending.tsx';

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
