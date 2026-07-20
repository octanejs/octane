import { useRef } from 'octane';
import {
	Form,
	Outlet,
	RouterProvider,
	createMemoryRouter,
	useActionData,
	useFetcher,
	useFetchers,
	useFormAction,
	useLoaderData,
	useLocation,
	useSubmit,
} from '@octanejs/remix-router';

// Phase D fixtures — <Form>, useSubmit, useFormAction, fetchers. All data
// mode (actions/fetchers need a data router).

async function echoAction({ request }: any) {
	const ct = request.headers.get('Content-Type') || '';
	if (ct.includes('application/json')) {
		const body = await request.json();
		return { via: 'json', method: request.method.toLowerCase(), name: body.name };
	}
	const fd = await request.formData();
	return { via: 'form', method: request.method.toLowerCase(), name: fd.get('name') };
}

function FormPage() @{
	const actionData = useActionData();
	const location = useLocation();
	const submit = useSubmit();
	<div>
		<p id="loc">{location.pathname + location.search}</p>
		<p id="action-out">
			{actionData ? actionData.via + ':' + actionData.method + ':' + actionData.name : '(none)'}
		</p>
		<Form id="get-form" method="get">
			<input name="q" defaultValue="octane" />
			<button id="get-submit" type="submit">get</button>
		</Form>
		<Form id="post-form" method="post">
			<input name="name" defaultValue="dominic" />
			<button id="post-submit" type="submit">post</button>
			<button id="put-submit" type="submit" formmethod="put">put</button>
		</Form>
		<button
			id="submit-json"
			onClick={() => submit({ name: 'imperative' }, {
				method: 'post',
				encType: 'application/json',
			})}
		>
			json
		</button>
	</div>
}

export function FormApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{ path: '/', action: echoAction, element: <FormPage /> },
		]);
	}
	<RouterProvider router={routerRef.current} />
}

// useFormAction resolution — index routes get ?index, actions resolve against
// the closest route.
function ActionShell() @{
	<div>
		<Outlet />
	</div>
}

function IndexProbe() @{
	const def = useFormAction();
	const destroy = useFormAction('destroy');
	<div>
		<p id="fa-default">{def}</p>
		<p id="fa-destroy">{destroy}</p>
	</div>
}

function ChildProbe() @{
	const def = useFormAction();
	const destroy = useFormAction('destroy');
	<div>
		<p id="fa-default">{def}</p>
		<p id="fa-destroy">{destroy}</p>
	</div>
}

export function FormActionApp(props: { initial?: string }) @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter(
			[
				{
					path: '/',
					element: <ActionShell />,
					children: [
						{ index: true, element: <IndexProbe /> },
						{ path: 'items/:id', element: <ChildProbe /> },
					],
				},
			],
			{ initialEntries: [props.initial ?? '/'] },
		);
	}
	<RouterProvider router={routerRef.current} />
}

// Fetchers — load lifecycle (gated loader), fetcher.Form / fetcher.submit,
// shared keys, useFetchers.
export const fetcherGate: { resolve: ((v: any) => void) | null } = { resolve: null };

async function fetchAction({ request }: any) {
	const fd = await request.formData();
	return { value: 'acted:' + fd.get('name') };
}

function FetcherPage() @{
	const fetcher = useFetcher();
	const shared = useFetcher({ key: 'shared' });
	const fetchers = useFetchers();
	const FForm = fetcher.Form;
	<div>
		<p id="f-state">{fetcher.state}</p>
		<p id="f-data">
			{fetcher.data ? fetcher.data.value : '(none)'}
		</p>
		<p id="shared-data">
			{shared.data ? shared.data.value : '(none)'}
		</p>
		<p id="f-count">{String(fetchers.length)}</p>
		<button id="f-load" onClick={() => fetcher.load('/api')}>load</button>
		<button id="shared-load" onClick={() => shared.load('/instant')}>shared-load</button>
		<FForm id="f-form" method="post" action="/act">
			<input name="name" defaultValue="fx" />
			<button id="f-form-submit" type="submit">fsubmit</button>
		</FForm>
		<button
			id="f-submit"
			onClick={() => fetcher.submit({ name: 'imperative' }, { method: 'post', action: '/act' })}
		>
			fs
		</button>
		<SharedReader />
	</div>
}

function SharedReader() @{
	// Same key → same fetcher state, read from a second component.
	const shared = useFetcher({ key: 'shared' });
	<p id="shared-mirror">
		{shared.data ? shared.data.value : '(none)'}
	</p>
}

export function FetcherApp() @{
	const routerRef = useRef(null);
	if (routerRef.current === null) {
		routerRef.current = createMemoryRouter([
			{ path: '/', element: <FetcherPage /> },
			{
				path: '/api',
				loader: () => new Promise((r) => (fetcherGate.resolve = r)),
			},
			{ path: '/instant', loader: () => ({ value: 'instant-data' }) },
			{ path: '/act', action: fetchAction },
		]);
	}
	<RouterProvider router={routerRef.current} />
}
