import { useLayoutEffect, useState } from 'octane';
import 'octane/signals';
import { session$ } from './State.tsrx';
import { captureSnapshot, exportCapture, recordActivation } from './measurements.ts';

export function Metrics() @{
	const [capture, setCapture] = useState(captureSnapshot());
	const [exportState, setExportState] = useState('');
	useLayoutEffect(() => {
		recordActivation('metrics');
		const timer = setInterval(() => setCapture(captureSnapshot()), 400);
		return () => clearInterval(timer);
	}, []);
	<section class="metrics" aria-label="Capture measurements">
		<header class="panel-header">
			<h2>Capture</h2>
			<span class="badge">Local fixture</span>
		</header>
		<p class="panel-note">
			Navigation → observed DOM. Times include capture overhead and are not paint or INP.
		</p>
		<dl class="timings">
			@for (const region of ['shell', 'answer', 'history', 'tools']; key region) {
				const observation = capture.observations.find(
					(entry) => entry.region === region && entry.event === 'dom-observed',
				);
				<div>
					<dt>{region as string}</dt>
					<dd>
						{observation ? `${observation.at.toFixed(1)} ms` : '—'}
					</dd>
				</div>
			}
		</dl>
		@if (!capture.enabled) {
			<p>Observation disabled or waiting for bootstrap.</p>
		}
		@if (capture.truncated) {
			<p role="alert">Browser capture limit reached.</p>
		}
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
		<details>
			<summary>Observation log ({String(capture.observations.length)})</summary>
			<ol class="observation-log">
				@for (const entry of capture.observations; key capture.observations.indexOf(entry)) {
					<li>
						<time>{entry.at.toFixed(1) as string}</time>
						<span>{`${entry.region ?? 'document'} · ${entry.event}${
							entry.revision === undefined ? '' : ` · r${entry.revision}`
						}`}</span>
					</li>
				}
			</ol>
		</details>
	</section>
}
