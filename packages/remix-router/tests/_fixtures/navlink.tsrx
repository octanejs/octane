import { useRef } from 'octane';
import {
	MemoryRouter,
	NavLink,
	Outlet,
	Route,
	RouterProvider,
	Routes,
	createMemoryRouter,
} from '@octanejs/remix-router';

// NavLink fixtures — active/pending/render-prop surfaces.

function Layout() @{
	<div>
		<nav>
			<NavLink id="nl-home" to="/" end>Home</NavLink>
			<NavLink id="nl-users" to="/users">Users</NavLink>
			<NavLink id="nl-users-end" to="/users" end>UsersEnd</NavLink>
			<NavLink id="nl-fn" to="/about" className={({ isActive }) => (isActive ? 'is-on' : 'is-off')}>
				About
			</NavLink>
			<NavLink
				id="nl-style"
				to="/about"
				style={({ isActive }) => (isActive ? { fontWeight: 'bold' } : undefined)}
			>
				AboutStyled
			</NavLink>
			<NavLink
				id="nl-child-fn"
				to="/users"
				children={({ isActive }) => (isActive ? 'ON' : 'OFF')}
			/>
			<NavLink id="nl-case" to="/About" caseSensitive>CaseAbout</NavLink>
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
	<h1>Users</h1>
}

function UserDetail() @{
	<h1>User</h1>
}

export function NavLinkApp(props: { initial?: string }) @{
	<MemoryRouter initialEntries={[props.initial ?? '/']}>
		<Routes>
			<Route path="/" element={<Layout />}>
				<Route index element={<Home />} />
				<Route path="about" element={<About />} />
				<Route path="users" element={<Users />} />
				<Route path="users/:id" element={<UserDetail />} />
			</Route>
		</Routes>
	</MemoryRouter>
}

// Pending state needs a DATA router (isPending reads
// DataRouterStateContext.navigation.location) and a loader that stays gated
// until the test releases it.
export const pendingGate: { resolve: (() => void) | null } = { resolve: null };

function PendingLayout() @{
	<div>
		<nav>
			<NavLink id="np-slow" to="/slow">Slow</NavLink>
		</nav>
		<Outlet />
	</div>
}

export function PendingNavLinkApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{
				path: '/',
				element: <PendingLayout />,
				children: [
					{ index: true, element: <h1>Home</h1> },
					{
						path: 'slow',
						loader: () => new Promise<null>((r) => (pendingGate.resolve = () => r(null))),
						element: <h1>Slow</h1>,
					},
				],
			},
		]);
	}
	<RouterProvider router={routerRef.current} />
}
