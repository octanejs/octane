import { useLayoutEffect } from 'octane';
import 'octane/signals';
import { session$ } from './State.tsrx';
import {
	captureEnabled$,
	captureTruncated$,
	exportBrowserTrace,
	exportState$,
	observationCount$,
	observationRows$,
	startCapturePolling,
	timings$,
	traceHref,
} from './CaptureState.tsrx';
import { recordActivation } from './measurements.ts';

export function Metrics() @{
	'use dom bindings';
	useLayoutEffect(() => {
		recordActivation('metrics');
		return startCapturePolling();
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
			@for (const timing of timings$.get(); key timing.region) {
				<div>
					<dt>{timing.region as string}</dt>
					<dd>{timing.label as string}</dd>
				</div>
			}
		</dl>
		@if (!captureEnabled$.get()) {
			<p>Observation disabled or waiting for bootstrap.</p>
		}
		@if (captureTruncated$.get()) {
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
					turns
				</p>
				<button type="button" onClick={() => exportBrowserTrace(config.run)}>
					Export browser trace
				</button>
				<output>{exportState$ as string}</output>
				<a href={traceHref(config.run)} target="_blank" rel="noreferrer">Producer trace ↗</a>
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
			<summary>Observation log ({observationCount$ as string})</summary>
			<ol class="observation-log">
				@for (const entry of observationRows$.get(); key entry.index) {
					<li>
						<time>{entry.at as string}</time>
						<span>{entry.label as string}</span>
					</li>
				}
			</ol>
		</details>
	</section>
}
