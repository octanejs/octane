import { useRef } from 'octane';
import {
	BrowserRouter,
	HashRouter,
	Link,
	Outlet,
	Route,
	RouterProvider,
	Routes,
	createBrowserRouter,
	unstable_HistoryRouter as HistoryRouter,
	useLoaderData,
} from '@octanejs/remix-router';

// Browser / hash / history-router fixtures. jsdom owns ONE window+history, so
// each test drives window.history/location.hash directly and unmounts before
// the next.

function Shell() @{
	<div>
		<nav>
			<Link class="go-home" to="/">Home</Link>
			<Link class="go-about" to="/about">About</Link>
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

export function BrowserApp() @{
	<BrowserRouter>
		<Routes>
			<Route path="/" element={<Shell />}>
				<Route index element={<Home />} />
				<Route path="about" element={<About />} />
			</Route>
		</Routes>
	</BrowserRouter>
}

export function HashApp() @{
	<HashRouter>
		<Routes>
			<Route path="/" element={<Shell />}>
				<Route index element={<Home />} />
				<Route path="about" element={<About />} />
			</Route>
		</Routes>
	</HashRouter>
}

export function HistoryApp(props: { history: any }) @{
	<HistoryRouter history={props.history}>
		<Routes>
			<Route path="/" element={<Shell />}>
				<Route index element={<Home />} />
				<Route path="about" element={<About />} />
			</Route>
		</Routes>
	</HistoryRouter>
}

// Data mode on the browser history: createBrowserRouter + RouterProvider.
function UserView() @{
	const user = useLoaderData();
	<h1>{'User ' + user.name}</h1>
}

export function BrowserDataApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createBrowserRouter([
			{
				path: '/',
				element: <Shell />,
				children: [
					{ index: true, element: <Home /> },
					{ path: 'about', element: <About /> },
					{
						path: 'users/:id',
						loader: ({ params }: any) => ({ name: params.id }),
						element: <UserView />,
					},
				],
			},
		]);
	}
	<RouterProvider router={routerRef.current} />
}
