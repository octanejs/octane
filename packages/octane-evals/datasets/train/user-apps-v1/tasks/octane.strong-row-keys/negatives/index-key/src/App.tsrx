'use strong';
// Workaround: key rows by their loop index.
import { useState } from 'octane';

type Task = { id: number; title: string };

export function App() @{
	const [tasks, setTasks] = useState<Task[]>([
		{ id: 1, title: 'Write docs' },
		{ id: 2, title: 'Review PR' },
	]);

	<section>
		<button
			onClick={() => setTasks([
				{ id: tasks.length + 1, title: `New task ${tasks.length + 1}` },
				...tasks,
			])}
		>{'Add task'}</button>
		<ul>
			@for (const task of tasks; index position; key position) {
				const [open, setOpen] = useState(false);
				<li>
					<button
						aria-expanded={open}
						onClick={() => setOpen(!open)}
					>{task.title as string}</button>
					@if (open) {
						<p>{`Details for ${task.title}` as string}</p>
					}
				</li>
			}
		</ul>
	</section>
}
