import {
	Link,
	Outlet,
	RouterProvider,
	createMemoryRouter,
	isRouteErrorResponse,
	redirect,
	useLoaderData,
	useRouteError,
} from '@octanejs/remix-router';

// Differential fixture: loader data, loader redirect, loader-thrown Response
// into an EXPLICIT errorElement (never the default boundary — dev stack traces
// can't byte-match), and boundary reset by navigating home.

function Layout() @{
	<div>
		<nav>
			<Link class="go-home" to="/">Home</Link>
			<Link class="go-data" to="/data">Data</Link>
			<Link class="go-secret" to="/secret">Secret</Link>
			<Link class="go-boom" to="/boom">Boom</Link>
		</nav>
		<main>
			<Outlet />
		</main>
	</div>
}

function Home() @{
	<h1>Home</h1>
}

function DataPage() @{
	const data = useLoaderData();
	<p>{'loader:' + data.value}</p>
}

function LoginPage() @{
	<h1>Login</h1>
}

function BoomError() @{
	const error = useRouteError();
	<p class="err">
		{isRouteErrorResponse(error) ? error.status + ' ' + error.data : 'unknown'}
	</p>
}

const routes = [
	{
		path: '/',
		element: <Layout />,
		children: [
			{ index: true, element: <Home /> },
			{
				path: 'data',
				element: <DataPage />,
				loader: () => ({ value: 'from-loader' }),
			},
			{
				path: 'secret',
				element: <p>never</p>,
				loader: () => redirect('/login'),
			},
			{
				path: 'login',
				element: <LoginPage />,
			},
			{
				path: 'boom',
				element: <p>never</p>,
				errorElement: <BoomError />,
				loader: () => {
					throw new Response('nope', { status: 400 });
				},
			},
		],
	},
];

const router = createMemoryRouter(routes, { initialEntries: ['/'] });

export function LoaderApp() @{
	<RouterProvider router={router} />
}
