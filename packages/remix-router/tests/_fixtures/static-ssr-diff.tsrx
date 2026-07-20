import {
	Link,
	Outlet,
	Route,
	Routes,
	StaticRouter,
	StaticRouterProvider,
	isRouteErrorResponse,
	useLoaderData,
	useRouteError,
} from '@octanejs/remix-router';

// Static SSR differential fixture (Phase F): the same route config + app
// renders through octane/server renderToString AND react-dom/server
// renderToString (via the react-cache compilation), driven by
// createStaticHandler/createStaticRouter on each side.

function Shell() @{
	<div>
		<nav>
			<Link class="go-home" to="/">Home</Link>
			<Link class="go-data" to="/data">Data</Link>
		</nav>
		<main>
			<Outlet />
		</main>
	</div>
}

function Home() @{
	<h1>Home</h1>
}

function DataView() @{
	const data = useLoaderData();
	<p>{'value=' + data.value}</p>
}

function Boom() @{
	const error = useRouteError();
	<p class="err">
		{isRouteErrorResponse(error) ? 'status=' + error.status + ':' + error.data : 'unknown'}
	</p>
}

export const routes = [
	{
		path: '/',
		element: <Shell />,
		children: [
			{ index: true, element: <Home /> },
			{
				path: 'data',
				loader: () => ({ value: 'ssr-data' }),
				element: <DataView />,
			},
			{
				path: 'boom',
				loader: () => {
					throw new Response('kaboom', { status: 400 });
				},
				element: <h1>never</h1>,
				errorElement: <Boom />,
			},
		],
	},
];

export function StaticApp(props: { router: any; context: any; hydrate?: boolean }) @{
	<StaticRouterProvider router={props.router} context={props.context} hydrate={props.hydrate} />
}

// Declarative static SSR — <StaticRouter> + <Routes> with DESCRIPTOR children
// (value-position <Route> elements walk identically on both sides; the .tsrx
// BLOCK-children form registers via layout effects, which never run on the
// server — documented divergence: block-children <Routes> is client-only).
const staticRoutes = [
	<Route path="/" element={<Shell />}>
		<Route index element={<Home />} />
		<Route path="about" element={<h2>About</h2>} />
	</Route>,
];

export function DeclarativeStaticApp(props: { url: string }) @{
	<StaticRouter location={props.url}>
		<Routes children={staticRoutes} />
	</StaticRouter>
}
