import { Suspense, startTransition, useState } from 'octane';
import { ActivityPanel } from './ActivityPanel.tsrx';
import { InsightsPanel } from './InsightsPanel.tsrx';
import { ProjectHeader } from './ProjectHeader.tsrx';

function Dashboard(props: { version: number }) @{
	<main data-dashboard-version={props.version}>
		<ProjectHeader version={props.version} />
		<ActivityPanel version={props.version} />
		<InsightsPanel version={props.version} />
	</main>
}

export function App() @{
	const [version, setVersion] = useState(0);
	(window as any).__bump = () => startTransition(() => setVersion((value: number) => value + 1));
	<Suspense fallback={<p data-fallback="dashboard">Loading dashboard…</p>}>
		<Dashboard version={version} />
	</Suspense>
}
