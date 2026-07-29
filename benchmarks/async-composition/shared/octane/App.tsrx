import { Suspense, startTransition, useState } from 'octane';
import { boardInputValue, boardRowsFor, boardRowText } from '../data.js';
import { ActivityPanel } from './ActivityPanel.tsrx';
import { InsightsPanel } from './InsightsPanel.tsrx';
import { ProjectHeader } from './ProjectHeader.tsrx';

// Synchronous transition-atomicity guard: keyed rows that reorder, drop and
// gain a member every version, plus a controlled input. All of it must move
// with the fetched panels in one step — the observer counts any earlier
// change as a mixed state.
function Board(props: { version: number }) @{
	<section class="board">
		@for (const id of boardRowsFor(props.version); key id) {
			<p data-resource={'row-' + id}>{boardRowText(id, props.version) as string}</p>
		}
		<input data-resource="board-input" value={boardInputValue(props.version)} onInput={() => {}} />
	</section>
}

function Dashboard(props: { version: number }) @{
	<main data-dashboard-version={props.version}>
		<ProjectHeader version={props.version} />
		<ActivityPanel version={props.version} />
		<InsightsPanel version={props.version} />
		<Board version={props.version} />
	</main>
}

export function App() @{
	const [version, setVersion] = useState(0);
	(window as any).__bump = () => startTransition(() => setVersion((value: number) => value + 1));
	<Suspense fallback={<p data-fallback="dashboard">Loading dashboard…</p>}>
		<Dashboard version={version} />
	</Suspense>
}
