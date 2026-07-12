import {
	useActionData,
	useHref,
	useLoaderData,
	useLocation,
	useNavigate,
	useNavigation,
	useNavigationType,
	useResolvedPath,
	useRevalidator,
	useRouteError,
	useRouteLoaderData,
	isRouteErrorResponse,
} from '@octanejs/remix-router';

// Conformance probe fixtures (Phase A hooks) — route configs live in the
// tests; these are reusable probe components. `nav` captures per-render hook
// values the tests drive/inspect (reset in each test's beforeEach).

export const nav: { fn?: any; revalidator?: any } = {};

// Captures useNavigate from WHICHEVER route is currently rendered, so tests
// exercise relative resolution from that route's context.
export function NavPage(props: { label: string }) @{
	const navigate = useNavigate();
	nav.fn = navigate;
	<h1>
		{props.label as string}
	</h1>
}

export function StateProbe() @{
	const location = useLocation();
	<p class="state">
		{'state:' + JSON.stringify(location.state)}
	</p>
}

// Renders "<status> <statusText>" for ErrorResponses (e.g. "404 Not Found").
export function StatusProbe() @{
	const error = useRouteError() as any;
	const text = isRouteErrorResponse(error)
		? error.status + ' ' + error.statusText
		: 'not-a-response';
	<p class="status">
		{text as string}
	</p>
}

export function RouteLoaderDataProbe(props: { routeId: string }) @{
	const data = useRouteLoaderData(props.routeId) as any;
	<p class="rld">
		{'rld:' + (data === undefined ? 'undefined' : JSON.stringify(data))}
	</p>
}

export function ActionProbe() @{
	const data = useActionData() as any;
	<p class="action">
		{'action:' + (data === undefined ? 'none' : data.msg)}
	</p>
}

export function RevalidatorPage() @{
	const data = useLoaderData() as any;
	const revalidator = useRevalidator();
	nav.revalidator = revalidator;
	<p class="reval">
		{'n:' + data.n + ':' + revalidator.state}
	</p>
}

export function NavTypeProbe() @{
	const type = useNavigationType();
	<p class="navtype">
		{'t:' + type}
	</p>
}

export function PathHrefProbe(props: { to: any }) @{
	const path = useResolvedPath(props.to);
	const href = useHref(props.to);
	<div>
		<p class="rp">
			{path.pathname + '|' + path.search + '|' + path.hash}
		</p>
		<p class="href">
			{'href:' + href}
		</p>
	</div>
}

// Mounted OUTSIDE any router by the outside-router invariant tests.
export function NavigationStateProbe() @{
	const navigation = useNavigation();
	<p class="navstate">
		{'s:' + navigation.state}
	</p>
}

export function HydrateFallback() @{
	<p class="fb">{'hydrating'}</p>
}
