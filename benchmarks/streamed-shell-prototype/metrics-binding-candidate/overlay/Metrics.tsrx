import { useLayoutEffect, useState } from 'octane';
import 'octane/signals';
import { session$ } from './State.tsrx';
import { captureSnapshot, exportCapture, recordActivation } from './measurements.ts';
import { MetricsFrame } from './MetricsFrame.tsrx';
import { MetricsActions } from './MetricsActions.tsrx';
import { projectActions, projectCapture } from './metrics-projection.ts';

export function Metrics() @{
	const [capture, setCapture] = useState(captureSnapshot());
	const [exportState, setExportState] = useState('');
	useLayoutEffect(() => {
		recordActivation('metrics');
		const timer = setInterval(() => setCapture(captureSnapshot()), 400);
		return () => clearInterval(timer);
	}, []);
	const frame = projectCapture(capture);
	<MetricsFrame
		timings={frame.timings}
		observations={frame.observations}
		enabled={frame.enabled}
		truncated={frame.truncated}
	>
		@try {
			const config = session$.get();
			const actions = projectActions(config, exportState, () => {
				setExportState('Exporting…');
				void exportCapture(config.run).then(
					() => setExportState('Exported'),
					(error: unknown) => setExportState(String(error)),
				);
			});
			<MetricsActions
				scenario={actions.scenario}
				waves={actions.waves}
				turns={actions.turns}
				historyRows={actions.historyRows}
				href={actions.href}
				run={actions.run}
				exportState={actions.exportState}
				onExport={actions.onExport}
			/>
		} @pending {
			<p>Waiting for the request configuration…</p>
		} @catch {
			<p>Capture configuration failed.</p>
		}
	</MetricsFrame>
}
