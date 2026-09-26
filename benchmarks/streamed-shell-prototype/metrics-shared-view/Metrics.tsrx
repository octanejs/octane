import { useLayoutEffect, useState } from 'octane';
import 'octane/signals';
import { session$ } from './State.tsrx';
import { captureSnapshot, exportCapture, recordActivation } from './measurements.ts';
import { MetricsFrame } from './MetricsFrame.tsrx';

export function Metrics() @{
	const [capture, setCapture] = useState(captureSnapshot());
	const [exportState, setExportState] = useState('');
	useLayoutEffect(() => {
		recordActivation('metrics');
		const timer = setInterval(() => setCapture(captureSnapshot()), 400);
		return () => clearInterval(timer);
	}, []);
	const timings = ['shell', 'answer', 'history', 'tools'].map((region) => {
		const observation = capture.observations.find(
			(entry) => entry.region === region && entry.event === 'dom-observed',
		);
		return {
			key: region,
			name: region,
			value: observation ? `${observation.at.toFixed(1)} ms` : '—',
		};
	});
	const observations = capture.observations.map(
		(entry) => ({
			key: capture.observations.indexOf(entry),
			time: entry.at.toFixed(1),
			text: `${entry.region ?? 'document'} · ${entry.event}${
				entry.revision === undefined ? '' : ` · r${entry.revision}`
			}`,
		}),
	);
	<MetricsFrame
		timings={timings}
		observations={observations}
		enabled={capture.enabled}
		truncated={capture.truncated}
	>
		@try {
			const config = session$.get();
			<div class="capture-actions">
				<p>
					Current run:
					{config.scenario as string}
					·
					{String(config.waves)}
					snapshots ·
					{String(config.turns)}
					turns ·
					{String(config.historyRows)}
					history rows
				</p>
				<button
					type="button"
					onClick={() => {
						setExportState('Exporting…');
						void exportCapture(config.run).then(
							() => setExportState('Exported'),
							(error: unknown) => setExportState(String(error)),
						);
					}}
				>Export browser trace</button>
				<output>{exportState as string}</output>
				<a
					href={'/__lab/trace?run=' + encodeURIComponent(config.run)}
					target="_blank"
					rel="noreferrer"
				>Producer trace ↗</a>
				<small>
					Run
					<code>{config.run as string}</code>
				</small>
			</div>
		} @pending {
			<p>Waiting for the request configuration…</p>
		} @catch {
			<p>Capture configuration failed.</p>
		}
	</MetricsFrame>
}
