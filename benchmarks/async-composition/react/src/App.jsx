import { Suspense, startTransition, useState } from 'react';
import { boardInputValue, boardRowsFor, boardRowText } from '../../shared/data.js';
import { ActivityPanel } from './ActivityPanel.jsx';
import { InsightsPanel } from './InsightsPanel.jsx';
import { ProjectHeader } from './ProjectHeader.jsx';

// Synchronous transition-atomicity guard — see the octane fixture's Board.
function Board({ version }) {
	return (
		<section className="board">
			{boardRowsFor(version).map((id) => (
				<p key={id} data-resource={'row-' + id}>
					{boardRowText(id, version)}
				</p>
			))}
			<input data-resource="board-input" value={boardInputValue(version)} onChange={() => {}} />
		</section>
	);
}

function Dashboard({ version }) {
	return (
		<main data-dashboard-version={version}>
			<ProjectHeader version={version} />
			<ActivityPanel version={version} />
			<InsightsPanel version={version} />
			<Board version={version} />
		</main>
	);
}

export function App() {
	const [version, setVersion] = useState(0);
	window.__bump = () => startTransition(() => setVersion((value) => value + 1));
	return (
		<Suspense fallback={<p data-fallback="dashboard">Loading dashboard…</p>}>
			<Dashboard version={version} />
		</Suspense>
	);
}
