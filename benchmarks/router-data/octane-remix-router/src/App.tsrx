// Same routes and best configuration as ../react-router, on the Octane port.
import {
	Form,
	Link,
	Outlet,
	RouterProvider,
	createBrowserRouter,
	useLoaderData,
	useSearchParams,
} from '@octanejs/remix-router';
import { api, rename } from '../../shared/api.js';
import { parentShouldRevalidate, taskShouldRevalidate } from '../../shared/revalidate.js';

function Shell() @{
	<div class="shell">
		<nav>
			<Link id="l-home" to="/">
				{'Home'}
			</Link>
			<Link id="l-cold" to="/org/1/project/2/task/3" prefetch="intent">
				{'Task 3'}
			</Link>
			<Link id="l-sib" to="/org/1/project/2/task/4" prefetch="intent">
				{'Task 4'}
			</Link>
			<Link id="l-tab" to="/org/1/project/2/task/4?tab=b" prefetch="intent">
				{'Task 4, tab b'}
			</Link>
			<Link id="l-pre" to="/org/5/project/6/task/7" prefetch="intent">
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
	const org = useLoaderData() as { id: string; name: string };
	<section class="org" data-org={org.id}>
		<h1>{org.name}</h1>
		<Outlet />
	</section>
}

function Project() @{
	const project = useLoaderData() as { id: string; name: string };
	<section class="project" data-project={project.id}>
		<h2>{project.name}</h2>
		<Outlet />
	</section>
}

function Task() @{
	const task = useLoaderData() as { id: string; title: string };
	const [search] = useSearchParams();
	<article class="task" data-task={task.id} data-tab={search.get('tab') ?? 'a'}>
		<h2 class="task-title" data-title={task.title}>
			{task.title}
		</h2>
		<Form class="rename" method="post">
			<input name="title" />
			<button type="submit">{'Save'}</button>
		</Form>
	</article>
}

const router = createBrowserRouter([
	{
		path: '/',
		Component: Shell,
		children: [
			{ index: true, Component: Home },
			{
				path: 'org/:org',
				loader: ({ params, request }: any) => api('org', { org: params.org }, request.signal),
				shouldRevalidate: parentShouldRevalidate,
				Component: Org,
				children: [
					{
						path: 'project/:project',
						loader: ({ params, request }: any) =>
							api('project', { org: params.org, project: params.project }, request.signal),
						shouldRevalidate: parentShouldRevalidate,
						Component: Project,
						children: [
							{
								path: 'task/:task',
								loader: ({ params, request }: any) =>
									api('task', { task: params.task }, request.signal),
								action: async ({ params, request }: any) => {
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

export function App() @{
	<RouterProvider router={router} />
}
