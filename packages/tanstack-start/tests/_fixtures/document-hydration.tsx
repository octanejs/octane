/** @jsxImportSource octane */
import { useState } from 'octane';
import type { OctaneNode } from 'octane';
import {
	Body,
	Head,
	HeadContent,
	Html,
	Outlet,
	Scripts,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '@octanejs/tanstack-router';
export { StartServer } from '../../src/runtime/server/StartServer.js';

function RootDocument({ children }: { children?: OctaneNode }) {
	return (
		<Html lang="en">
			<Head>
				<HeadContent />
			</Head>
			<Body>
				{children}
				<Scripts />
			</Body>
		</Html>
	);
}

function Counter() {
	const [count, setCount] = useState(0);
	return (
		<main>
			<input id="draft" aria-label="Draft" defaultValue="server" />
			<button id="counter" onClick={() => setCount((value) => value + 1)}>
				Count: {count}
			</button>
		</main>
	);
}

export function makeDocumentRouter(isServer: boolean) {
	const root = createRootRoute({ component: Outlet, shellComponent: RootDocument });
	const index = createRoute({
		getParentRoute: () => root,
		path: '/',
		component: Counter,
		scripts: () => [
			{ id: 'route-data', type: 'application/json', children: '{"value":"retained"}' },
		],
	});
	return createRouter({
		routeTree: root.addChildren([index]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		isServer,
		scrollRestoration: true,
		ssr: { nonce: 'fixture-nonce' },
	});
}
