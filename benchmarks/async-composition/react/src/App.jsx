import { Suspense, startTransition, useState } from 'react';
import { ActivityPanel } from './ActivityPanel.jsx';
import { InsightsPanel } from './InsightsPanel.jsx';
import { ProjectHeader } from './ProjectHeader.jsx';

function Dashboard({ version }) {
	return (
		<main data-dashboard-version={version}>
			<ProjectHeader version={version} />
			<ActivityPanel version={version} />
			<InsightsPanel version={version} />
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
