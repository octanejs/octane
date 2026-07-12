import { useRef, useState } from 'octane';
import {
	Link,
	useNavigate,
	Outlet,
	RouterProvider,
	ScrollRestoration,
	createMemoryRouter,
	unstable_usePrompt,
	unstable_useRoute,
	unstable_useRouterState,
	useBeforeUnload,
	useBlocker,
	useViewTransitionState,
} from '@octanejs/remix-router';

// Phase E fixtures — blockers, prompt, scroll restoration, beforeunload,
// useRoute/useRouterState, useViewTransitionState.

function BlockerShell() @{
	const [shouldBlock, setShouldBlock] = useState(false);
	const blocker = useBlocker(shouldBlock);
	<div>
		<nav>
			<Link id="to-home" to="/">Home</Link>
			<Link id="to-away" to="/away">Away</Link>
		</nav>
		<p id="b-state">{blocker.state}</p>
		<button id="b-toggle" onClick={() => setShouldBlock((v) => !v)}>toggle</button>
		@if (blocker.state === 'blocked') {
			<>
				<button id="b-proceed" onClick={() => blocker.proceed()}>proceed</button>
				<button id="b-reset" onClick={() => blocker.reset()}>reset</button>
			</>
		}
		<main>
			<Outlet />
		</main>
	</div>
}

export function BlockerApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{
				path: '/',
				element: <BlockerShell />,
				children: [
					{ index: true, element: <h1>Home</h1> },
					{ path: 'away', element: <h1>Away</h1> },
				],
			},
		]);
	}
	<RouterProvider router={routerRef.current} />
}

function PromptShell() @{
	const [armed, setArmed] = useState(false);
	unstable_usePrompt({ when: armed, message: 'Leave?' });
	<div>
		<nav>
			<Link id="to-away" to="/away">Away</Link>
		</nav>
		<button id="p-arm" onClick={() => setArmed(true)}>arm</button>
		<main>
			<Outlet />
		</main>
	</div>
}

export function PromptApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{
				path: '/',
				element: <PromptShell />,
				children: [
					{ index: true, element: <h1>Home</h1> },
					{ path: 'away', element: <h1>Away</h1> },
				],
			},
		]);
	}
	<RouterProvider router={routerRef.current} />
}

function ScrollShell() @{
	const navigate = useNavigate();
	<div>
		<nav>
			<Link id="to-home" to="/">Home</Link>
			<Link id="to-away" to="/away">Away</Link>
			<button id="go-back" onClick={() => navigate(-1)}>back</button>
		</nav>
		<ScrollRestoration />
		<main>
			<Outlet />
		</main>
	</div>
}

export function ScrollApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{
				path: '/',
				element: <ScrollShell />,
				children: [
					{ index: true, element: <h1>Home</h1> },
					{ path: 'away', element: <h1>Away</h1> },
				],
			},
		]);
	}
	<RouterProvider router={routerRef.current} />
}

export const unloadLog: string[] = [];

function UnloadProbe() @{
	useBeforeUnload(() => unloadLog.push('beforeunload'));
	<h1>Unload</h1>
}

export function BeforeUnloadApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{ path: '/', element: <UnloadProbe /> },
		]);
	}
	<RouterProvider router={routerRef.current} />
}

// unstable_useRoute / unstable_useRouterState probes; the /slow loader is
// gated so the pending variant is observable.
export const stateGate: { resolve: ((v: any) => void) | null } = { resolve: null };

function StateShell() @{
	const rs = unstable_useRouterState();
	const self = unstable_useRoute();
	const byId = unstable_useRoute('probe');
	const vt = useViewTransitionState('/slow');
	<div>
		<nav>
			<Link id="to-slow" to="/slow?a=1">Slow</Link>
		</nav>
		<p id="rs-active">
			{rs.active.location.pathname + '|' + rs.active.searchParams.toString() + '|' + rs.active.type}
		</p>
		<p id="rs-matches">{rs.active.matches.map((m) => m.id).join(',')}</p>
		<p id="rs-pending">
			{rs.pending ? rs.pending.state + ':' + rs.pending.location.pathname : '(idle)'}
		</p>
		<p id="route-handle">
			{self ? String(self.handle) : '(none)'}
		</p>
		<p id="route-by-id">
			{byId ? String(byId.loaderData ?? '(no data)') : '(no match)'}
		</p>
		<p id="vt-state">{String(vt)}</p>
		<main>
			<Outlet />
		</main>
	</div>
}

export function RouterStateApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{
				id: 'shell',
				path: '/',
				handle: 'shell-handle',
				element: <StateShell />,
				children: [
					{ id: 'probe', index: true, loader: () => 'probe-data', element: <h1>Home</h1> },
					{
						id: 'slow',
						path: 'slow',
						loader: () => new Promise((r) => (stateGate.resolve = r)),
						element: <h1>Slow</h1>,
					},
				],
			},
		]);
	}
	<RouterProvider router={routerRef.current} />
}
