import {
	BaseRootRoute,
	BaseRoute,
	createRootRoute,
	createFileRoute,
	createLazyFileRoute,
	getRouteApi,
	Link,
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
	useMatch,
	useRouteContext,
	notFound,
	type ErrorComponentProps,
	type NotFoundRouteProps,
} from '@octanejs/tanstack-router/compiled';
import { useState } from 'octane';
export { CompiledRouterProvider } from '@octanejs/tanstack-router/compiled';

function Shell(props: { children?: unknown }) @{
	const match = useMatch({ strict: false });
	const context = useRouteContext({ strict: false }) as { shell: string };
	<div class="document-shell" data-route={match.routeId} data-context={context.shell}>
		{props.children}
	</div>
}

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
		beforeLoad: () => ({ shell: 'root context' }),
		notFoundComponent: NotFoundView,
		...(opts.shell ? { shellComponent: Shell } : {}),
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

export function makeCompiledFileRouter(initial = '/files/a') {
	const api = getRouteApi('/files/$id' as any);
	const root = createRootRoute({ component: Layout });
	const file = createFileRoute('/files/$id' as never)({
		loader: ({ params }: any) => {
			if (params.id === 'missing') throw api.notFound({ data: 'route api missing' });
			return { label: 'File ' + params.id };
		},
		notFoundComponent: NotFoundView,
	} as any).update({
		id: '/files/$id',
		path: '/files/$id',
		getParentRoute: () => root,
	} as any);
	const lazyFile = createLazyFileRoute('/files/$id' as never)({ component: File });
	file.lazy(async () => lazyFile as any);
	function File() @{
		const direct = file.useParams() as any;
		const lazyParams = lazyFile.useParams() as any;
		const selected = api.useLoaderData() as any;
		const navigate = file.useNavigate();
		<section class="file" data-lazy={lazyParams.id}>
			<p>{(direct.id + ':' + selected.label) as string}</p>
			<file.Link class="file-relative" to="." params={{ id: 'b' }} search={{ page: 2 }}>
				Next file
			</file.Link>
			<api.Link class="file-api" to="." params={{ id: 'c' }}>
				API file
			</api.Link>
			<Link class="file-timing" to="/files/$id" params={{ id: 'e' }}>
				{({ isTransitioning }) => String(isTransitioning)}
			</Link>
			<Link class="file-missing" to="/files/$id" params={{ id: 'missing' }}>
				Missing
			</Link>
			<button onClick={() => navigate({ to: '.', params: { id: 'd' } } as any)}>Navigate</button>
		</section>
	}
	return createRouter({
		routeTree: root.addChildren([file]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
