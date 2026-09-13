import { createRoot, createPortal, useState } from 'octane';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
	Link,
	Outlet,
	useLocation,
} from '../../src';

function PortalLocation() @{
	const pathname = useLocation({ select: (location) => location.pathname });
	if (pathname === '/failure') throw new Error('Portal failed');
	<output data-portal-location>{pathname as string}</output>
}

export function mount(target: HTMLElement, portal: HTMLElement) {
	let release!: () => void;
	let visits = 0;
	const pending = new Promise<void>((resolve) => {
		release = resolve;
	});
	function Layout() @{
		const [value, setValue] = useState('');
		<section>
			<input
				aria-label="Persistent note"
				value={value}
				onInput={(event) => setValue(event.currentTarget.value)}
			/>
			<nav>
				<Link to="/">Home</Link>
				<Link to="/details">Details</Link>
				<Link to="/failure">Failure</Link>
			</nav>
			<Outlet />
			{createPortal(<PortalLocation />, portal)}
		</section>
	}
	function Home() @{
		<h1>Home screen</h1>
	}
	function Details() @{
		<h1>Details screen</h1>
	}
	function Pending() @{
		<p role="status">Loading details</p>
	}
	function Failure() @{
		<p role="alert">Portal failed</p>
	}
	const route = createRootRoute({ component: Layout, errorComponent: Failure });
	const home = createRoute({ getParentRoute: () => route, path: '/', component: Home });
	const details = createRoute({
		getParentRoute: () => route,
		path: '/details',
		component: Details,
		loader: async () => {
			visits++;
			await pending;
		},
		pendingMs: 0,
		pendingMinMs: 0,
		pendingComponent: Pending,
	});
	const failure = createRoute({ getParentRoute: () => route, path: '/failure', component: Home });
	const router = createRouter({
		routeTree: route.addChildren([home, details, failure]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
	const root = createRoot(target);
	root.render(RouterProvider, { router });
	return {
		release,
		visits: () => visits,
		navigate: router.navigate,
		unmount: () => root.unmount(),
	};
}
