import { Suspense, lazy, startTransition, useState } from 'octane';
import { boardInputValue, boardRowsFor, boardRowText } from '../data.js';
import { ActivityPanel } from './ActivityPanel.tsrx';
import { InsightsPanel } from './InsightsPanel.tsrx';
import { ProjectHeader } from './ProjectHeader.tsrx';

const DASHBOARD_PANELS = ['activity', 'insights'];
const LazyCodeProof = lazy(() => {
	const benchmark = globalThis as
		typeof globalThis & {
			__octaneLazyCodeLoads?: number;
			__octaneLazyCodeStartedAt?: number;
		};
	benchmark.__octaneLazyCodeLoads = (benchmark.__octaneLazyCodeLoads ?? 0) + 1;
	benchmark.__octaneLazyCodeStartedAt = performance.now();
	return import('./LazyCodeProof.tsrx').then((module) => ({ default: module.LazyCodeProof }));
});

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
		@for (const panel of DASHBOARD_PANELS; key panel) {
			@if (panel === 'activity') {
				<ActivityPanel version={props.version} />
			} @else {
				<InsightsPanel version={props.version} />
			}
		}
		<Board version={props.version} />
		<LazyCodeProof version={props.version} />
	</main>
}

export function App() @{
	const [version, setVersion] = useState(0);
	(window as any).__bump = () => startTransition(() => setVersion((value: number) => value + 1));
	<Suspense fallback={<p data-fallback="dashboard">Loading dashboard…</p>}>
		<Dashboard version={version} />
	</Suspense>
}
