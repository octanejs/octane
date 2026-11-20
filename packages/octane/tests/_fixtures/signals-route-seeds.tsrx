import type { Resource, SignalHandle } from 'octane/signals';
import 'octane/signals';

export interface RouteMatches {
	org$: Resource<{ id: string; name: string }>;
	project$: Resource<{ id: string; name: string }>;
	task$: Resource<{ id: string; title: string }>;
}

function Task(props: { task$: RouteMatches['task$'] }) @{
	const task = props.task$.get();
	<article class="task" data-task={task.id}>
		{task.title as string}
	</article>
}

function Project(props: { matches: RouteMatches }) @{
	const project = props.matches.project$.get();
	<section class="project" data-project={project.id}>
		<h2>{project.name as string}</h2>
		<Task task$={props.matches.task$} />
	</section>
}

function Org(props: { matches: RouteMatches }) @{
	const org = props.matches.org$.get();
	<section class="org" data-org={org.id}>
		<h1>{org.name as string}</h1>
		<Project matches={props.matches} />
	</section>
}

/**
 * Nested route matches, each reading the loader resource of its own explicit
 * `route:*` scope. A navigation writes `location$` inside a transition, after
 * the router has created the next matches' scopes.
 */
export function Routes(props: {
	location$: SignalHandle<string>;
	matches$: (path: string) => RouteMatches;
}) @{
	<main>
		@try {
			<Org matches={props.matches$(props.location$.get())} />
		} @pending {
			<i class="pending">{'loading'}</i>
		}
	</main>
}
