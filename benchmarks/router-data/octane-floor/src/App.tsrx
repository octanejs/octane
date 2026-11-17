'use strong';
import 'octane/signals';
import { entry$, location$, match, renameTask } from './router.ts';
import type { Match } from './router.ts';

function onRename(task: string, event: SubmitEvent) {
	event.preventDefault();
	const form = event.currentTarget as HTMLFormElement;
	renameTask(task, String(new FormData(form).get('title')));
}

function Task(props: { m: Match; tab: string }) @{
	const e = entry$(props.m);
	const task = e.data$.get();
	const shown = e.visible$.get();
	<article class="task" data-task={task.id} data-tab={props.tab}>
		<h2 class="task-title" data-title={task.title}>
			{shown.title as string}
		</h2>
		<form class="rename" method="post" onSubmit={(event: SubmitEvent) => onRename(task.id, event)}>
			<input name="title" />
			<button type="submit">{'Save'}</button>
		</form>
	</article>
}

function Project(props: { matches: readonly Match[]; tab: string }) @{
	const project = entry$(props.matches[1]).data$.get();
	<section class="project" data-project={project.id}>
		<h2>{project.name as string}</h2>
		@if (props.matches.length > 2) {
			<Task m={props.matches[2]} tab={props.tab} />
		}
	</section>
}

function Org(props: { matches: readonly Match[]; tab: string }) @{
	const org = entry$(props.matches[0]).data$.get();
	<section class="org" data-org={org.id}>
		<h1>{org.name as string}</h1>
		@if (props.matches.length > 1) {
			<Project matches={props.matches} tab={props.tab} />
		}
	</section>
}

export function App() @{
	const loc = location$.get();
	const matches = match(loc.path);
	const tab = loc.search.get('tab') ?? 'a';
	<div class="shell">
		<nav>
			<a id="l-home" href="/">
				{'Home'}
			</a>
			<a id="l-cold" href="/org/1/project/2/task/3">
				{'Task 3'}
			</a>
			<a id="l-sib" href="/org/1/project/2/task/4">
				{'Task 4'}
			</a>
			<a id="l-tab" href="/org/1/project/2/task/4?tab=b">
				{'Task 4, tab b'}
			</a>
			<a id="l-pre" href="/org/5/project/6/task/7">
				{'Task 7'}
			</a>
		</nav>
		@if (matches.length > 0) {
			<Org matches={matches} tab={tab} />
		} @else {
			<p class="home">{'Home'}</p>
		}
	</div>
}
