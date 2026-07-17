import { use } from 'react';
import { loadResource } from '../../shared/data.js';

function ActivitySummary({ version }) {
	const summary = use(loadResource('activity-summary', version));
	return <p data-resource="activity-summary">{summary.label}</p>;
}

export function ActivityPanel({ version }) {
	const activity = use(loadResource('activity', version));
	return (
		<section data-panel="activity">
			<h2 data-resource="activity">{activity.label}</h2>
			<ActivitySummary version={version} />
		</section>
	);
}
