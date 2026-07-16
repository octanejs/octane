import { use } from 'react';
import { loadResource } from '../../shared/data.js';

function InsightsChart({ version }) {
	const chart = use(loadResource('insights-chart', version));
	return <figure data-resource="insights-chart">{chart.label}</figure>;
}

export function InsightsPanel({ version }) {
	const insights = use(loadResource('insights', version));
	return (
		<section data-panel="insights">
			<h2 data-resource="insights">{insights.label}</h2>
			<InsightsChart version={version} />
		</section>
	);
}
