import { use } from 'octane';
import { loadResource } from '../data.js';

function InsightsChart(props: { version: number }) @{
	const chart = use(loadResource('insights-chart', props.version));
	<figure data-resource="insights-chart">
		{chart.label as string}
	</figure>
}

export function InsightsPanel(props: { version: number }) @{
	const insights = use(loadResource('insights', props.version));
	<section data-panel="insights">
		<h2 data-resource="insights">
			{insights.label as string}
		</h2>
		<InsightsChart version={props.version} />
	</section>
}
