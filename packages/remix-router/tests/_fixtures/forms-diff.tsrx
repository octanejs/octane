import {
	Form,
	RouterProvider,
	createMemoryRouter,
	useActionData,
	useFetcher,
	useFetchers,
	useLocation,
	useNavigation,
	useSubmit,
} from '@octanejs/remix-router';

// Differential fixture for Phase D: <Form> GET/POST (native submit on the
// octane side, synthetic on the React side — jsdom fires SubmitEvent with
// `submitter` for both), submitter formmethod override, JSON useSubmit,
// fetcher load/Form/submit lifecycle, and the useFetchers count. Module-level
// router per compilation side (established F2 pattern).

async function echoAction({ request }: any) {
	const ct = request.headers.get('Content-Type') || '';
	if (ct.includes('application/json')) {
		const body = await request.json();
		return { via: 'json', method: request.method.toLowerCase(), name: body.name };
	}
	const fd = await request.formData();
	return { via: 'form', method: request.method.toLowerCase(), name: fd.get('name') };
}

async function fetchAction({ request }: any) {
	const fd = await request.formData();
	return { value: 'acted:' + fd.get('name') };
}

function FormsPage() @{
	const actionData = useActionData();
	const location = useLocation();
	const navigation = useNavigation();
	const submit = useSubmit();
	const fetcher = useFetcher();
	const fetchers = useFetchers();
	const FForm = fetcher.Form;
	<div>
		<p id="loc">
			{location.pathname + location.search}
		</p>
		<p id="nav-state">{navigation.state}</p>
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
		<p id="f-state">{fetcher.state}</p>
		<p id="f-data">
			{fetcher.data ? fetcher.data.value : '(none)'}
		</p>
		<p id="f-count">{String(fetchers.length)}</p>
		<button id="f-load" onClick={() => fetcher.load('/instant')}>load</button>
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
	</div>
}

const router = createMemoryRouter([
	{ path: '/', action: echoAction, element: <FormsPage /> },
	{ path: '/instant', loader: () => ({ value: 'instant-data' }) },
	{ path: '/act', action: fetchAction },
]);

export function FormsDiffApp() @{
	<RouterProvider router={router} />
}
