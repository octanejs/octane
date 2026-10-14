import {
	BaseRootRoute,
	BaseRoute,
	createRouter,
	createMemoryHistory,
	CompiledOutlet,
	lazyCompiledRouteComponent,
	useLoaderData,
	useNavigate,
	useParams,
	useLocation,
	useCanGoBack,
	useMatches,
	notFound,
	type ErrorComponentProps,
	type NotFoundRouteProps,
} from '@octanejs/tanstack-router/compiled';
import { useState } from 'octane';
export { CompiledRouterProvider } from '@octanejs/tanstack-router/compiled';

function Layout() @{
	const selected = useMatches({ select: (matches) => matches.at(-1)?.routeId });
	<div class="compiled-layout">
		<header data-selected={selected}>Routes</header>
		<CompiledOutlet />
	</div>
}

function Home() @{
	const navigate = useNavigate();
	<button class="go-item" onClick={() => navigate({ to: '/items/a' } as any)}>
		Open item
	</button>
}

function Items() @{
	<section class="items-layout">
		<h1>Items</h1>
		<CompiledOutlet />
	</section>
}

function Item() @{
	const params = useParams({ from: '/items/$id' }) as any;
	const data = useLoaderData({ strict: false }) as any;
	const location = useLocation({ select: (state) => state.pathname });
	const back = useCanGoBack();
	const [count, setCount] = useState(0);
	<article class="item" data-path={location} data-back={String(back)}>
		<span class="value">{(params.id + ':' + data.name) as string}</span>
		<button class="count" onClick={() => setCount(count + 1)}>
			{String(count)}
		</button>
	</article>
}

function ErrorView(props: ErrorComponentProps) @{
	<p class="route-error">
		{(props.error instanceof Error ? props.error.message : String(props.error)) as string}
	</p>
}
function NotFoundView(props: NotFoundRouteProps) @{
	<p class="not-found">{String(props.data ?? 'unknown')}</p>
}
function Pending() @{
	<p class="pending">Loading</p>
}

export function makeCompiledRouter(
	initial = '/',
	opts: {
		rejected?: boolean;
		invalid?: boolean;
		wrap?: boolean;
		shell?: boolean;
		isServer?: boolean;
		loader?: () => Promise<unknown>;
	} = {},
) {
	const root = new BaseRootRoute({
		component: Layout,
		notFoundComponent: NotFoundView,
		...(opts.shell ? { shellComponent: Layout } : {}),
	});
	const home = new BaseRoute({ getParentRoute: () => root, path: '/', component: Home });
	const items = new BaseRoute({
		getParentRoute: () => root,
		path: 'items',
		component: Items,
		notFoundComponent: NotFoundView,
	});
	const item = new BaseRoute({
		getParentRoute: () => items,
		path: '$id',
		loader: async ({ params }: any) => {
			if (opts.loader) await opts.loader();
			if (params.id === 'missing') throw notFound({ data: 'no item' });
			if (opts.rejected) throw new Error('item failed');
			return { name: 'Name ' + params.id };
		},
		component: opts.invalid
			? ((() => 'plain returned text') as any)
			: lazyCompiledRouteComponent(async () => ({ Item }), 'Item'),
		pendingComponent: Pending,
		errorComponent: ErrorView,
		remountDeps: ({ params }: any) => [params.id],
	});
	items.addChildren([item]);
	return createRouter({
		routeTree: root.addChildren([home, items]),
		history: createMemoryHistory({ initialEntries: [initial] }),
		isServer: opts.isServer,
		defaultPendingMs: 0,
		defaultPendingMinMs: 0,
		...(opts.wrap ? { Wrap: Layout } : {}),
	});
}
