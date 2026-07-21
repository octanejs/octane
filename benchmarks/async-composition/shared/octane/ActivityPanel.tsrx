import { use } from 'octane';
import { loadResource } from '../data.js';

function ActivitySummary(props: { version: number }) @{
	const summary = use(loadResource('activity-summary', props.version));
	<p data-resource="activity-summary">{summary.label as string}</p>
}

export function ActivityPanel(props: { version: number }) @{
	const activity = use(loadResource('activity', props.version));
	<section data-panel="activity">
		<h2 data-resource="activity">{activity.label as string}</h2>
		<ActivitySummary version={props.version} />
	</section>
}
