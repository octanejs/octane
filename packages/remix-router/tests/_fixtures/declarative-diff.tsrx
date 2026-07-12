import {
	Link,
	MemoryRouter,
	Navigate,
	Outlet,
	Route,
	Routes,
	useParams,
} from '@octanejs/remix-router';

// Differential fixture for DECLARATIVE mode (Phase B): the natural
// `<Routes><Route/></Routes>` authoring. On the React side this is upstream's
// element-children walk; on the octane side the same source compiles the
// children into an opaque block that goes through the registration collector.
// Both must settle to byte-identical HTML after every step.

function Layout() @{
	<div>
		<nav>
			<Link class="nav-home" to="/">Home</Link>
			<Link class="nav-about" to="/about">About</Link>
			<Link class="nav-user" to="/users/42">User</Link>
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

export function DeclarativeDiffApp() @{
	<MemoryRouter initialEntries={['/']}>
		<Routes>
			<Route path="/" element={<Layout />}>
				<Route index element={<Home />} />
				<Route path="about" element={<About />} />
				<Route path="users/:id" element={<UserDetail />} />
			</Route>
		</Routes>
	</MemoryRouter>
}

function NewPage() @{
	<h1>New</h1>
}

export function NavigateDiffApp() @{
	<MemoryRouter initialEntries={['/old']}>
		<Routes>
			<Route path="/old" element={<Navigate to="/new" replace />} />
			<Route path="/new" element={<NewPage />} />
		</Routes>
	</MemoryRouter>
}
