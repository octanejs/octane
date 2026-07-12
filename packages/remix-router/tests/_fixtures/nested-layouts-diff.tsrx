import {
	Link,
	Outlet,
	RouterProvider,
	createMemoryRouter,
	useParams,
} from '@octanejs/remix-router';

// Differential fixture: nested layouts + params navigation, all Link-click
// driven. The SAME source runs on octane (via @octanejs/remix-router) AND on
// React (the setup rewrites the import to real `react-router`), asserting
// byte-identical innerHTML after each step. Byte-compare rules: no default
// error boundary, no location.key, single-flight navigations.

function Layout() @{
	<div>
		<nav>
			<Link class="nav-home" to="/">Home</Link>
			<Link class="nav-about" to="/about">About</Link>
			<Link class="nav-user" to="/users/42">User 42</Link>
		</nav>
		<main>
			<Outlet />
		</main>
	</div>
}

function Home() @{
	<h1>Home</h1>
}

function About() @{
	<h1>About</h1>
}

function Users() @{
	<section>
		<h1>Users</h1>
		<Outlet />
	</section>
}

function UserDetail() @{
	const params = useParams();
	<p>
		{'Item ' + params.id}
	</p>
}

const routes = [
	{
		path: '/',
		element: <Layout />,
		children: [
			{ index: true, element: <Home /> },
			{ path: 'about', element: <About /> },
			{
				path: 'users',
				element: <Users />,
				children: [
					{ path: ':id', element: <UserDetail /> },
				],
			},
		],
	},
];

// Module-level: one router per module instance (each differential side gets
// its own compile), never re-minted by re-renders.
const router = createMemoryRouter(routes, { initialEntries: ['/'] });

export function NestedApp() @{
	<RouterProvider router={router} />
}
