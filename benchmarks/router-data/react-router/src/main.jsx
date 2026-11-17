import '../../shared/api.js';
import '../../shared/probe.js';
import { createRoot } from 'react-dom/client';
import {
	Form,
	Link,
	Outlet,
	RouterProvider,
	createBrowserRouter,
	useLoaderData,
	useSearchParams,
} from 'react-router';
import { api, rename } from '../../shared/api.js';
import { parentShouldRevalidate, taskShouldRevalidate } from '../../shared/revalidate.js';

// Best configuration for this journey is in ../../shared/revalidate.js. React
// Router data mode has no loader cache and no data prefetch on intent (Link
// prefetch needs framework mode), so those ops pay full loads.

function Shell() {
	return (
		<div className="shell">
			<nav>
				<Link id="l-home" to="/">
					Home
				</Link>
				<Link id="l-cold" to="/org/1/project/2/task/3" prefetch="intent">
					Task 3
				</Link>
				<Link id="l-sib" to="/org/1/project/2/task/4" prefetch="intent">
					Task 4
				</Link>
				<Link id="l-tab" to="/org/1/project/2/task/4?tab=b" prefetch="intent">
					Task 4, tab b
				</Link>
				<Link id="l-pre" to="/org/5/project/6/task/7" prefetch="intent">
					Task 7
				</Link>
			</nav>
			<Outlet />
		</div>
	);
}

function Org() {
	const org = useLoaderData();
	return (
		<section className="org" data-org={org.id}>
			<h1>{org.name}</h1>
			<Outlet />
		</section>
	);
}

function Project() {
	const project = useLoaderData();
	return (
		<section className="project" data-project={project.id}>
			<h2>{project.name}</h2>
			<Outlet />
		</section>
	);
}

function Task() {
	const task = useLoaderData();
	const [search] = useSearchParams();
	return (
		<article className="task" data-task={task.id} data-tab={search.get('tab') ?? 'a'}>
			<h2 className="task-title" data-title={task.title}>
				{task.title}
			</h2>
			<Form className="rename" method="post">
				<input name="title" />
				<button type="submit">Save</button>
			</Form>
		</article>
	);
}

const router = createBrowserRouter([
	{
		path: '/',
		Component: Shell,
		children: [
			{ index: true, Component: () => <p className="home">Home</p> },
			{
				path: 'org/:org',
				loader: ({ params, request }) => api('org', { org: params.org }, request.signal),
				shouldRevalidate: parentShouldRevalidate,
				Component: Org,
				children: [
					{
						path: 'project/:project',
						loader: ({ params, request }) =>
							api('project', { org: params.org, project: params.project }, request.signal),
						shouldRevalidate: parentShouldRevalidate,
						Component: Project,
						children: [
							{
								path: 'task/:task',
								loader: ({ params, request }) => api('task', { task: params.task }, request.signal),
								action: async ({ params, request }) => {
									const form = await request.formData();
									await rename(params.task, String(form.get('title')));
									return null;
								},
								shouldRevalidate: taskShouldRevalidate,
								Component: Task,
							},
						],
					},
				],
			},
		],
	},
]);

createRoot(document.getElementById('main')).render(<RouterProvider router={router} />);
