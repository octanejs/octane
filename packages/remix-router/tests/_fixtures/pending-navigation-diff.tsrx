import {
	Link,
	Outlet,
	RouterProvider,
	createMemoryRouter,
	useLoaderData,
	useNavigation,
} from '@octanejs/remix-router';

// Differential fixture: deterministic PENDING navigation state — /slow's
// loader is gated on a module-level deferred, so the mid-navigation UI
// (old page + data-state="loading") is stable and byte-comparable; #finish
// releases it.
let finish;
const gate = new Promise((res) => {
	finish = res;
});

function Layout() @{
	const navigation = useNavigation();
	<div data-state={navigation.state}>
		<nav>
			<Link class="nav-home" to="/">Home</Link>
			<Link class="nav-slow" to="/slow">Slow</Link>
			<button id="finish" onClick={() => finish('slow-data')}>go</button>
		</nav>
		<main>
			<Outlet />
		</main>
	</div>
}

function Home() @{
	<h1>Home</h1>
}

function Slow() @{
	const data = useLoaderData();
	<h1>{'Slow:' + data}</h1>
}

const routes = [
	{
		path: '/',
		element: <Layout />,
		children: [
			{ index: true, element: <Home /> },
			{ path: 'slow', element: <Slow />, loader: () => gate },
		],
	},
];

const router = createMemoryRouter(routes, { initialEntries: ['/'] });

export function PendingApp() @{
	<RouterProvider router={router} />
}
