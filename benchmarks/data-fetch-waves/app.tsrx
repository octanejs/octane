/**
 * One project screen, the same components under every strategy. The project
 * header renders first; owner, members, tasks and activity each have their
 * own pending state, so the header is useful before the rest arrives.
 *
 * - `component`: each component reads its own data when it mounts. The
 *   sections mount inside the project, so they are discovered once it loads.
 * - `prefetch`: the same component reads, with the route starting the four
 *   reads it can name from the URL before rendering (see client.ts).
 * - `aggregate`: every component takes its part of one `dashboard` read.
 */
import type { DataStore } from 'octane/data';
import { DataProvider, useDataStore, useRead } from 'octane/data/octane';
import { activity, dashboard, members, project, tasks, user } from './screen.data.ts';
import type { Event, Project, Task, User } from './screen.data.ts';

export type Strategy = 'component' | 'prefetch' | 'aggregate';
interface Props {
	readonly strategy: Strategy;
	readonly id: string;
}

function useDashboard(id: string) {
	return useRead(useDataStore().read(dashboard, id));
}
function useProject({ strategy, id }: Props): Project {
	if (strategy === 'aggregate') return useDashboard(id).project;
	return useRead(useDataStore().read(project, id));
}
function useOwner({ strategy, id }: Props, ownerId: string): User {
	if (strategy === 'aggregate') return useDashboard(id).owner;
	return useRead(useDataStore().read(user, ownerId));
}
function useMembers({ strategy, id }: Props): readonly User[] {
	if (strategy === 'aggregate') return useDashboard(id).members;
	return useRead(useDataStore().read(members, id));
}
function useTasks({ strategy, id }: Props): readonly Task[] {
	if (strategy === 'aggregate') return useDashboard(id).tasks;
	return useRead(useDataStore().read(tasks, id));
}
function useActivity({ strategy, id }: Props): readonly Event[] {
	if (strategy === 'aggregate') return useDashboard(id).activity;
	return useRead(useDataStore().read(activity, id));
}

function Owner(props: Props & { ownerId: string }) @{
	const owner = useOwner(props, props.ownerId);
	<p class="owner-name">{owner.name as string}</p>
}

function Members(props: Props) @{
	const list = useMembers(props);
	<ul class="members">
		@for (const member of list; key member.id) {
			<li>{member.name as string}</li>
		}
	</ul>
}

function Tasks(props: Props) @{
	const list = useTasks(props);
	<ul class="tasks">
		@for (const task of list; key task.id) {
			<li data-done={task.done ? '' : undefined}>{task.title as string}</li>
		}
	</ul>
}

function Activity(props: Props) @{
	const list = useActivity(props);
	<ol class="activity">
		@for (const event of list; key event.id) {
			<li>{event.text as string}</li>
		}
	</ol>
}

function ProjectPage(props: Props) @{
	const current = useProject(props);
	<article class="project">
		<h1 class="project-name">{current.name as string}</h1>
		<section>
			@try {
				<Owner {...props} ownerId={current.ownerId} />
			} @pending {
				<p class="pending">Loading owner…</p>
			}
		</section>
		<section>
			@try {
				<Members {...props} />
			} @pending {
				<p class="pending">Loading members…</p>
			}
		</section>
		<section>
			@try {
				<Tasks {...props} />
			} @pending {
				<p class="pending">Loading tasks…</p>
			}
		</section>
		<section>
			@try {
				<Activity {...props} />
			} @pending {
				<p class="pending">Loading activity…</p>
			}
		</section>
	</article>
}

export function App(props: Props & { store: DataStore }) @{
	const { store, ...screen } = props;
	<DataProvider store={store}>
		<main class="screen">
			@try {
				<ProjectPage {...screen} />
			} @pending {
				<p class="pending">Loading project…</p>
			}
		</main>
	</DataProvider>
}
