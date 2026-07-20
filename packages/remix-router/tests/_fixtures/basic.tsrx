import {
	Outlet,
	RouterProvider,
	useLoaderData,
	useLocation,
	useMatches,
	useNavigate,
	useNavigation,
	useParams,
	useRouteError,
	isRouteErrorResponse,
} from '@octanejs/remix-router';

// Conformance fixtures — the router is created PER TEST and passed as a prop
// (fresh state each test; upstream's own tests do the same). Route configs
// live in the tests; these are the reusable route components.

export const captured: { navigate?: any; log: string[] } = { log: [] };

export function App(props: { router: any }) @{
	<RouterProvider router={props.router} />
}

export function Layout() @{
	const navigation = useNavigation();
	<div>
		<header data-state={navigation.state}>layout</header>
		<main>
			<Outlet />
		</main>
	</div>
}

export function Home() @{
	const navigate = useNavigate();
	captured.navigate = navigate;
	<h1>Home</h1>
}

export function About() @{
	<h1>About</h1>
}

export function UserDetail() @{
	const params = useParams();
	<p>{'User ' + params.id}</p>
}

export function Splat() @{
	const params = useParams();
	<p>{'Splat ' + params['*']}</p>
}

export function LoaderPage() @{
	const data = useLoaderData();
	<p>{'data:' + data.value}</p>
}

export function LocationProbe() @{
	const location = useLocation();
	<p>{location.pathname + location.search + location.hash}</p>
}

export function MatchesProbe() @{
	const matches = useMatches();
	<p>{matches.map((m: any) => m.id).join(',')}</p>
}

export function ErrorProbe() @{
	const error = useRouteError();
	<p class="err">
		{isRouteErrorResponse(error)
			? 'response:' + error.status + ':' + error.data
			: error instanceof Error
				? 'error:' + error.message
				: 'unknown:' + String(error)}
	</p>
}
