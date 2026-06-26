import { createRouter, createRootRoute, createRoute, Outlet, Link } from '@octane-ts/router';
import { createMemoryHistory } from '@octane-ts/router';

// A layout whose nav renders a <Link> carrying arbitrary pass-through props
// (data-*/aria-*/title/id) alongside the routing props — asserting they land on
// the rendered <a> without disturbing href/active behavior.
function RootLayout() @{
	<div class="root">
		<nav>
			<Link
				to="/"
				class="nav-home"
				data-testid="lk"
				aria-label="go"
				title="t"
				id="home-link"
			>{'Home'}</Link>
			<Link to="/about" class="nav-about">{'About'}</Link>
		</nav>
		<Outlet />
	</div>
}

function IndexPage() @{
	<h1 class="index">{'Index'}</h1>
}

function AboutPage() @{
	<h1 class="about">{'About page'}</h1>
}

export function makeRouter(initial: string) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: IndexPage,
	});
	const aboutRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/about',
		component: AboutPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
