import { Await, RouterProvider, createMemoryRouter, useLoaderData } from '@octanejs/remix-router';
import { Suspense } from 'octane';

// Differential fixture: <Await> on a deferred loader value at INITIAL mount
// of the route subtree (navigation-into-suspense transition timing is not
// byte-comparable). Module-level deferreds — each rig side has its own module
// instance and resolves its own promise via the buttons.
let resolveMsg;
let rejectMsg;
const msgPromise = new Promise((res, rej) => {
	resolveMsg = res;
	rejectMsg = rej;
});

function Page() @{
	const data = useLoaderData();
	<div>
		<button id="resolve" onClick={() => resolveMsg('hello')}>r</button>
		<button id="reject" onClick={() => rejectMsg(new Error('await-fail'))}>x</button>
		<Suspense fallback={<p class="fallback">waiting</p>}>
			<Await resolve={data.msg} errorElement={<p class="await-err">failed</p>}>
				{(value) => <p class="value">{'got:' + value}</p>}
			</Await>
		</Suspense>
	</div>
}

const routes = [
	{
		path: '/',
		element: <Page />,
		loader: () => ({ msg: msgPromise }),
	},
];

const router = createMemoryRouter(routes, { initialEntries: ['/'] });

export function AwaitApp() @{
	<RouterProvider router={router} />
}
