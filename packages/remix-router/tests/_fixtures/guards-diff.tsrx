import { useState } from 'octane';
import {
	Link,
	Outlet,
	RouterProvider,
	createMemoryRouter,
	unstable_useRoute,
	unstable_useRouterState,
	useBlocker,
} from '@octanejs/remix-router';

// Differential fixture for Phase E: useBlocker lifecycle (unblocked → blocked
// → reset/proceed) and unstable_useRoute / unstable_useRouterState probes —
// byte-identical vs real react-router after every step. Scroll restoration
// and usePrompt are conformance-only (window.scrollTo / window.confirm side
// effects, not HTML).

function GuardShell() @{
	const [shouldBlock, setShouldBlock] = useState(false);
	const blocker = useBlocker(shouldBlock);
	const rs = unstable_useRouterState();
	const self = unstable_useRoute();
	<div>
		<nav>
			<Link id="to-home" to="/">Home</Link>
			<Link id="to-away" to="/away?x=2">Away</Link>
		</nav>
		<p id="b-state">{blocker.state}</p>
		<button id="b-toggle" onClick={() => setShouldBlock((v) => !v)}>toggle</button>
		@if (blocker.state === 'blocked') {
			<>
				<button id="b-proceed" onClick={() => blocker.proceed()}>proceed</button>
				<button id="b-reset" onClick={() => blocker.reset()}>reset</button>
			</>
		}
		<p id="rs-active">
			{rs.active.location.pathname + '|' + rs.active.searchParams.toString() + '|' + rs.active.type}
		</p>
		<p id="rs-matches">{rs.active.matches.map((m) => m.id).join(',')}</p>
		<p id="rs-pending">
			{rs.pending ? rs.pending.state : '(idle)'}
		</p>
		<p id="route-handle">
			{self ? String(self.handle) : '(none)'}
		</p>
		<main>
			<Outlet />
		</main>
	</div>
}

const router = createMemoryRouter([
	{
		id: 'shell',
		path: '/',
		handle: 'shell-handle',
		element: <GuardShell />,
		children: [
			{ id: 'home', index: true, element: <h1>Home</h1> },
			{ id: 'away', path: 'away', element: <h1>Away</h1> },
		],
	},
]);

export function GuardsDiffApp() @{
	<RouterProvider router={router} />
}
