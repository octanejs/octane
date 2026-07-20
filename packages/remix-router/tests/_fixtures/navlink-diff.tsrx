import {
	MemoryRouter,
	NavLink,
	Outlet,
	Route,
	Routes,
	useSearchParams,
} from '@octanejs/remix-router';

// Differential fixture for Phase C: NavLink active-state derivation (default
// `active` class, `end`, className render prop, aria-current, children render
// prop) and useSearchParams round-trips — byte-identical vs real react-router
// after every step. MemoryRouter keeps both sides off the shared jsdom
// window.history. Style render props are exercised in conformance only (React
// and octane serialize inline style attributes differently).

function Layout() @{
	<div>
		<nav>
			<NavLink id="nl-home" to="/" end>Home</NavLink>
			<NavLink id="nl-users" to="/users">Users</NavLink>
			<NavLink id="nl-users-end" to="/users" end>UsersEnd</NavLink>
			<NavLink
				id="nl-fn"
				to="/search"
				className={({ isActive }) => (isActive ? 'is-on' : 'is-off')}
			>
				Search
			</NavLink>
			<NavLink
				id="nl-child-fn"
				to="/users"
				children={({ isActive }) => (isActive ? 'ON' : 'OFF')}
			/>
		</nav>
		<main>
			<Outlet />
		</main>
	</div>
}

function Home() @{
	<h1>Home</h1>
}

function Users() @{
	<div>
		<h1>Users</h1>
		<NavLink id="nl-user-7" to="/users/7">Seven</NavLink>
	</div>
}

function UserDetail() @{
	<h1>User</h1>
}

function SearchPage() @{
	const [searchParams, setSearchParams] = useSearchParams({ q: 'fallback' });
	<div>
		<p id="q">{'q=' + (searchParams.get('q') ?? '(none)')}</p>
		<button id="set-q" onClick={() => setSearchParams({ q: 'octane' })}>set</button>
		<button id="clear-q" onClick={() => setSearchParams({})}>clear</button>
	</div>
}

export function NavLinkDiffApp() @{
	<MemoryRouter initialEntries={['/']}>
		<Routes>
			<Route path="/" element={<Layout />}>
				<Route index element={<Home />} />
				<Route path="users" element={<Users />} />
				<Route path="users/:id" element={<UserDetail />} />
				<Route path="search" element={<SearchPage />} />
			</Route>
		</Routes>
	</MemoryRouter>
}
