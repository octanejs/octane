// Same routes and best configuration as ../tanstack-router, on the Octane port.
import {
	Link,
	Outlet,
	RouterProvider,
	createRootRoute,
	createRoute,
	createRouter,
	useRouter,
} from '@octanejs/tanstack-router';
import { api, rename } from '../../shared/api.js';

function Shell() @{
	<div class="shell">
		<nav>
			<Link id="l-home" to="/">
				{'Home'}
			</Link>
			<Link id="l-cold" to="/org/1/project/2/task/3">
				{'Task 3'}
			</Link>
			<Link id="l-sib" to="/org/1/project/2/task/4">
				{'Task 4'}
			</Link>
			<Link id="l-tab" to="/org/1/project/2/task/4" search={{ tab: 'b' }}>
				{'Task 4, tab b'}
			</Link>
			<Link id="l-pre" to="/org/5/project/6/task/7">
				{'Task 7'}
			</Link>
		</nav>
		<Outlet />
	</div>
}

function Home() @{
	<p class="home">{'Home'}</p>
}

function Org() @{
	const org = orgRoute.useLoaderData() as { id: string; name: string };
	<section class="org" data-org={org.id}>
		<h1>{org.name}</h1>
		<Outlet />
	</section>
}

function Project() @{
	const project = projectRoute.useLoaderData() as { id: string; name: string };
	<section class="project" data-project={project.id}>
		<h2>{project.name}</h2>
		<Outlet />
	</section>
}

function Task() @{
	const task = taskRoute.useLoaderData() as { id: string; title: string };
	const search = taskRoute.useSearch() as { tab?: string };
	const router = useRouter();
	const onSubmit = async (event: SubmitEvent) => {
		event.preventDefault();
		const title = String(new FormData(event.currentTarget as HTMLFormElement).get('title'));
		await rename(task.id, title);
		await router.invalidate({ filter: (match: any) => match.routeId === taskRoute.id });
	};
	<article class="task" data-task={task.id} data-tab={search.tab ?? 'a'}>
		<h2 class="task-title" data-title={task.title}>
			{task.title}
		</h2>
		<form class="rename" method="post" onSubmit={onSubmit}>
			<input name="title" />
			<button type="submit">{'Save'}</button>
		</form>
	</article>
}

const rootRoute = createRootRoute({ component: Shell });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Home });
const orgRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: 'org/$org',
	loader: ({ params, abortController }: any) =>
		api('org', { org: params.org }, abortController.signal),
	component: Org,
});
const projectRoute = createRoute({
	getParentRoute: () => orgRoute,
	path: 'project/$project',
	loader: ({ params, abortController }: any) =>
		api('project', { org: params.org, project: params.project }, abortController.signal),
	component: Project,
});
const taskRoute = createRoute({
	getParentRoute: () => projectRoute,
	path: 'task/$task',
	validateSearch: (search: Record<string, unknown>) => ({
		tab: typeof search.tab === 'string' ? search.tab : undefined,
	}),
	loader: ({ params, abortController }: any) =>
		api('task', { task: params.task }, abortController.signal),
	component: Task,
});

const router = createRouter({
	routeTree: rootRoute.addChildren([
		indexRoute,
		orgRoute.addChildren([projectRoute.addChildren([taskRoute])]),
	]),
	defaultPreload: 'intent',
	defaultPreloadDelay: 50,
	defaultStaleTime: 30_000,
	defaultPreloadStaleTime: 30_000,
});

export function App() @{
	<RouterProvider router={router} />
}
