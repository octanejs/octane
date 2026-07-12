import { useState } from 'octane';
import {
	Link,
	MemoryRouter,
	Navigate,
	Outlet,
	Route,
	Routes,
	useParams,
} from '@octanejs/remix-router';

// Declarative-mode fixtures. These exercise the BLOCK-children `<Routes>`
// path — the natural .tsrx authoring compiles Route children into an opaque
// render block, so <Route>s register through the collector (see
// routes-collector.ts) rather than being walked as descriptors.

function Layout() @{
	<div>
		<nav>
			<Link class="nav-home" to="/">Home</Link>
			<Link class="nav-about" to="/about">About</Link>
			<Link class="nav-user" to="/users/7">User</Link>
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

function UserDetail() @{
	const params = useParams();
	<p>
		{'User ' + params.id}
	</p>
}

function Splat() @{
	const params = useParams();
	<p>
		{'Splat ' + params['*']}
	</p>
}

// Nested block-children Routes: layout route + index + params + splat.
export function DeclarativeApp(props: { initial?: string }) @{
	<MemoryRouter initialEntries={[props.initial ?? '/']}>
		<Routes>
			<Route path="/" element={<Layout />}>
				<Route index element={<Home />} />
				<Route path="about" element={<About />} />
				<Route path="users">
					<Route path=":id" element={<UserDetail />} />
				</Route>
				<Route path="files/*" element={<Splat />} />
			</Route>
		</Routes>
	</MemoryRouter>
}

// <Navigate> declarative redirect on mount.
export function NavigateApp() @{
	<MemoryRouter initialEntries={['/old']}>
		<Routes>
			<Route path="/old" element={<Navigate to="/new" replace />} />
			<Route path="/new" element={<h1>New</h1>} />
		</Routes>
	</MemoryRouter>
}

// Conditionally-mounted <Route> between static siblings — the registration
// ordering caveat: the late route registers at the END of the collector, which
// only matters for matchRoutes score TIES (here /extra matches uniquely, so
// behavior is correct regardless of order).
export function ConditionalApp() @{
	const [showExtra, setShowExtra] = useState(false);
	<div>
		<button id="add-route" onClick={() => setShowExtra(true)}>add</button>
		<MemoryRouter initialEntries={['/extra']}>
			<Routes>
				<Route path="/" element={<Home />} />
				@if (showExtra) {
					<Route path="/extra" element={<h1>Extra</h1>} />
				}
				<Route path="*" element={<p class="nf">not found</p>} />
			</Routes>
		</MemoryRouter>
	</div>
}
