import { expectTypeOf } from 'vitest';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	getRouteApi,
	linkOptions,
	useMatchRoute,
} from '@octanejs/tanstack-router';

const rootRoute = createRootRoute();
const postRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: 'posts/$postId',
	loader: () => ({ title: 'Post' }),
});
const routeTree = rootRoute.addChildren([postRoute]);
const router = createRouter({
	routeTree,
	history: createMemoryHistory({ initialEntries: ['/'] }),
});

declare module '@octanejs/tanstack-router' {
	interface Register {
		router: typeof router;
	}
}

expectTypeOf(postRoute.fullPath).toEqualTypeOf<'/posts/$postId'>();
expectTypeOf(postRoute.useParams()).toEqualTypeOf<{ postId: string }>();
expectTypeOf(postRoute.useLoaderData()).toEqualTypeOf<{ title: string }>();

const postApi = getRouteApi('/posts/$postId');
expectTypeOf(postApi.id).toEqualTypeOf<'/posts/$postId'>();
expectTypeOf(postApi.useParams()).toEqualTypeOf<{ postId: string }>();
expectTypeOf(postApi.useLoaderData()).toEqualTypeOf<{ title: string }>();

const postLink = linkOptions({
	to: '/posts/$postId',
	params: { postId: '42' },
});
expectTypeOf(postLink.to).toEqualTypeOf<'/posts/$postId'>();
expectTypeOf(postLink.params).toEqualTypeOf<{ readonly postId: '42' }>();

// @ts-expect-error unknown route ids stay rejected by the registered route tree
getRouteApi('/missing');
// @ts-expect-error links must target a route from the registered route tree
linkOptions({ to: '/missing' });

const matchPost = useMatchRoute();
expectTypeOf(matchPost({ to: '/posts/$postId' })).toEqualTypeOf<false | { postId: string }>();
// @ts-expect-error matchers reject routes absent from the registered route tree
matchPost({ to: '/missing' });

const otherRoot = createRootRoute();
const otherRoute = createRoute({ getParentRoute: () => otherRoot, path: 'items/$itemId' });
const otherRouter = createRouter({ routeTree: otherRoot.addChildren([otherRoute]) });
const matchItem = useMatchRoute<typeof otherRouter>();
expectTypeOf(matchItem({ to: '/items/$itemId' })).toEqualTypeOf<false | { itemId: string }>();
// @ts-expect-error an explicit router controls the matcher instead of the global registration
matchItem({ to: '/posts/$postId' });
