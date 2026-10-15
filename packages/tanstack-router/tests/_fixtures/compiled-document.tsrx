import { HYDRATION_RANGE_BOUNDARY, useState } from 'octane';
import * as ordinary from '@octanejs/tanstack-router';
import * as compiled from '@octanejs/tanstack-router/compiled';

export function makeDocumentRouter(
	options: {
		compiled?: boolean;
		isServer?: boolean;
		initial?: string;
	} = {},
) {
	const api = options.compiled ? compiled : ordinary;
	function Document(props: { children?: unknown }) @{
		<api.Html lang="en">
			<api.Head>
				<api.HeadContent />
			</api.Head>
			<api.Body>
				{props.children}
				<api.Scripts />
			</api.Body>
		</api.Html>
	}
	function Layout() @{
		<>
			<header>
				<api.Link to="/" class="home">
					Home
				</api.Link>
				<api.Link to="/next" class="next">
					Next
				</api.Link>
			</header>
			<api.Outlet />
		</>
	}
	function Page() @{
		const [count, setCount] = useState(0);
		<main>
			<input aria-label="Uncontrolled" defaultValue="server" />
			<button id="count" onClick={() => setCount(count + 1)}>
				{String(count)}
			</button>
		</main>
	}
	const root = api.createRootRoute({ component: Layout, shellComponent: Document });
	const home = api.createRoute({
		getParentRoute: () => root,
		path: '/',
		component: Page,
		head: () => ({
			meta: [{ title: 'Script home' }],
			styles: [{ children: 'main { color: red }' }],
		}),
		scripts: () => [
			{ children: '(window.__routeScripts ??= []).push("home-inline")' },
			{ src: '/route-script.js?home', defer: true },
		],
	});
	const next = api.createRoute({
		getParentRoute: () => root,
		path: 'next',
		component: Page,
		head: () => ({
			meta: [{ title: 'Script next' }],
			styles: [{ children: 'main { color: blue }' }],
		}),
		scripts: () => [
			{ children: '(window.__routeScripts ??= []).push("next-inline")' },
			{ src: '/route-script.js?next', defer: true },
		],
	});
	return api.createRouter({
		routeTree: root.addChildren([home, next]),
		history: api.createMemoryHistory({ initialEntries: [options.initial ?? '/'] }),
		isServer: options.isServer,
		ssr: { nonce: 'script-test-nonce' },
	});
}

export function DocumentClient(props: { router: any; compiled?: boolean }) @{
	@if (props.compiled) {
		<compiled.RouterProvider router={props.router} />
	} @else {
		<ordinary.RouterProvider router={props.router} />
	}
}

(
	DocumentClient as typeof DocumentClient & {
		[HYDRATION_RANGE_BOUNDARY]: 'passthrough';
	}
)[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
