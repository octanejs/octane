import { expectTypeOf } from 'vitest';
import {
	createRootRoute,
	createRootRouteWithContext,
	createRoute,
	createFileRoute,
	createLazyFileRoute,
	createRouter,
	createMemoryHistory,
	getRouteApi,
	Link,
	PreconfiguredRouterProvider,
} from '@octanejs/tanstack-router/compiled';

const root = createRootRoute();
const item = createRoute({
	getParentRoute: () => root,
	path: 'items/$id',
	loader: () => ({ title: 'Item' }),
});
const tree = root.addChildren([item]);
const router = createRouter({ routeTree: tree, history: createMemoryHistory() });
PreconfiguredRouterProvider({ router });
// @ts-expect-error preconfigured providers do not accept router option props
PreconfiguredRouterProvider({ router, defaultPendingMs: 50 });
expectTypeOf(item.useParams<typeof router>()).toEqualTypeOf<{ id: string }>();
expectTypeOf(item.useLoaderData<typeof router>()).toEqualTypeOf<{ title: string }>();
expectTypeOf(item.addChildren([]).Link).toEqualTypeOf(item.Link);
expectTypeOf(tree._addFileTypes<unknown>().useParams()).toEqualTypeOf<{}>();

const api = getRouteApi<'/items/$id', typeof router>('/items/$id');
expectTypeOf(api.useParams<typeof router>()).toEqualTypeOf<{ id: string }>();
expectTypeOf(api.useLoaderData<typeof router>()).toEqualTypeOf<{ title: string }>();

const contextual = createRootRouteWithContext<{ token: string }>()();
expectTypeOf(contextual.types.routerContext).toEqualTypeOf<{ token: string }>();

// These generated-file identities are registered by the ordinary public-type
// fixture; both entrypoints share router-core's module augmentation.
const file = createFileRoute('/posts/$postId')({ loader: () => ({ compiled: true }) });
expectTypeOf(file.types.loaderData).toEqualTypeOf<{ compiled: boolean }>();
const lazy = createLazyFileRoute('/posts/$postId')({});
expectTypeOf(lazy.useParams()).toEqualTypeOf<{ postId: string }>();

// The compiled anchor keeps the ordinary registered-route validation.
Link({ to: '/posts/$postId', params: { postId: 'one' } });
// @ts-expect-error a post link requires its route parameter
Link({ to: '/posts/$postId' });
