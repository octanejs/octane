import '../../shared/api.js';
import '../../shared/probe.js';
import { createRoot } from 'react-dom/client';
import {
	Link,
	Outlet,
	RouterProvider,
	createRootRoute,
	createRoute,
	createRouter,
	useRouter,
} from '@tanstack/react-router';
import { api, rename } from '../../shared/api.js';

// Best documented configuration for this journey: intent preload, a 30 s
// staleTime matching the other targets' fresh window, no loaderDeps (no loader
// reads search), and an invalidate filtered to the renamed task's route.
const rootRoute = createRootRoute({
	component: () => (
		<div className="shell">
			<nav>
				<Link id="l-home" to="/">
					Home
				</Link>
				<Link id="l-cold" to="/org/1/project/2/task/3">
					Task 3
				</Link>
				<Link id="l-sib" to="/org/1/project/2/task/4">
					Task 4
				</Link>
				<Link id="l-tab" to="/org/1/project/2/task/4" search={{ tab: 'b' }}>
					Task 4, tab b
				</Link>
				<Link id="l-pre" to="/org/5/project/6/task/7">
					Task 7
				</Link>
			</nav>
			<Outlet />
		</div>
	),
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: () => <p className="home">Home</p>,
});

const orgRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: 'org/$org',
	loader: ({ params, abortController }) => api('org', { org: params.org }, abortController.signal),
	component: function Org() {
		const org = orgRoute.useLoaderData();
		return (
			<section className="org" data-org={org.id}>
				<h1>{org.name}</h1>
				<Outlet />
			</section>
		);
	},
});

const projectRoute = createRoute({
	getParentRoute: () => orgRoute,
	path: 'project/$project',
	loader: ({ params, abortController }) =>
		api('project', { org: params.org, project: params.project }, abortController.signal),
	component: function Project() {
		const project = projectRoute.useLoaderData();
		return (
			<section className="project" data-project={project.id}>
				<h2>{project.name}</h2>
				<Outlet />
			</section>
		);
	},
});

const taskRoute = createRoute({
	getParentRoute: () => projectRoute,
	path: 'task/$task',
	validateSearch: (search) => ({ tab: typeof search.tab === 'string' ? search.tab : undefined }),
	loader: ({ params, abortController }) =>
		api('task', { task: params.task }, abortController.signal),
	component: function Task() {
		const task = taskRoute.useLoaderData();
		const { tab } = taskRoute.useSearch();
		const router = useRouter();
		const onSubmit = async (event) => {
			event.preventDefault();
			const title = String(new FormData(event.currentTarget).get('title'));
			await rename(task.id, title);
			await router.invalidate({ filter: (match) => match.routeId === taskRoute.id });
		};
		return (
			<article className="task" data-task={task.id} data-tab={tab ?? 'a'}>
				<h2 className="task-title" data-title={task.title}>
					{task.title}
				</h2>
				<form className="rename" method="post" onSubmit={onSubmit}>
					<input name="title" />
					<button type="submit">Save</button>
				</form>
			</article>
		);
	},
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

createRoot(document.getElementById('main')).render(<RouterProvider router={router} />);
