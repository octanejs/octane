import { expectTypeOf } from 'vitest';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createLazyFileRoute,
	createRouter,
	getRouteApi,
	linkOptions,
} from '@octanejs/tanstack-router';

const rootRoute = createRootRoute();
const postRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: 'posts/$postId',
	loader: () => ({ title: 'Post' }),
});
const commentRoute = createRoute({
	getParentRoute: () => postRoute,
	path: 'comments/$commentId',
});
const posts = postRoute.addChildren([commentRoute]);
const routeTree = rootRoute.addChildren([posts]);
const router = createRouter({
	routeTree,
	history: createMemoryHistory({ initialEntries: ['/'] }),
});

declare module '@octanejs/tanstack-router' {
	interface Register {
		router: typeof router;
	}
	interface FileRoutesByPath {
		'/posts/$postId': {
			id: '/posts/$postId';
			path: 'posts/$postId';
			fullPath: '/posts/$postId';
			parentRoute: typeof rootRoute;
			preLoaderRoute: typeof postRoute;
		};
		'/posts/$postId/comments/$commentId': {
			id: '/posts/$postId/comments/$commentId';
			path: 'comments/$commentId';
			fullPath: '/posts/$postId/comments/$commentId';
			parentRoute: typeof postRoute;
			preLoaderRoute: typeof commentRoute;
		};
	}
}

expectTypeOf(postRoute.fullPath).toEqualTypeOf<'/posts/$postId'>();
expectTypeOf(postRoute.useParams()).toEqualTypeOf<{ postId: string }>();
expectTypeOf(postRoute.useLoaderData()).toEqualTypeOf<{ title: string }>();

// Adding children returns the same concrete binding route; its methods remain
// callable, including after file-route type combinators and lazy configuration.
expectTypeOf(routeTree.useParams()).toEqualTypeOf<{}>();
expectTypeOf(posts.useParams()).toEqualTypeOf<{ postId: string }>();
expectTypeOf(posts.useLoaderData()).toEqualTypeOf<{ title: string }>();
expectTypeOf(posts.Link).toEqualTypeOf(postRoute.Link);
expectTypeOf(rootRoute._addFileChildren({ posts }).useNavigate).toEqualTypeOf(
	rootRoute.useNavigate,
);
expectTypeOf(posts._addFileTypes<unknown>().useParams()).toEqualTypeOf<{ postId: string }>();
declare const lazyPost: Parameters<typeof postRoute.lazy>[0];
expectTypeOf(postRoute.lazy(lazyPost).useParams()).toEqualTypeOf<{ postId: string }>();
expectTypeOf(createLazyFileRoute('/posts/$postId')({}).useParams()).toEqualTypeOf<{
	postId: string;
}>();

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
