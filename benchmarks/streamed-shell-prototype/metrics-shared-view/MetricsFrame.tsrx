import type { OctaneNode } from 'octane';
import { unbound } from 'octane/behavior';

export type TimingRow = { key: string; name: string; value: string };
export type ObservationRow = { key: number; time: string; text: string };
export type MetricsFrameProps = {
	timings: TimingRow[];
	observations: ObservationRow[];
	enabled: boolean;
	truncated: boolean;
	children: OctaneNode;
};

// This presentation is shared by ordinary rendering now and a potential
// future binding experiment. Its caller owns projections and the async range.
export function MetricsFrame(props: MetricsFrameProps) @{
	'use dom bindings';
	<section class="metrics" aria-label="Capture measurements">
		<header class="panel-header">
			<h2>Capture</h2>
			<span class="badge">Local fixture</span>
		</header>
		<p class="panel-note">
			Navigation → observed DOM. Times include capture overhead and are not paint or INP.
		</p>
		<dl class="timings">
			@for (const row of props.timings; key row.key) {
				<div>
					<dt>{row.name as string}</dt>
					<dd>{row.value as string}</dd>
				</div>
			}
		</dl>
		@if (!props.enabled) {
			<p>Observation disabled or waiting for bootstrap.</p>
		}
		@if (props.truncated) {
			<p role="alert">Browser capture limit reached.</p>
		}
		{unbound(props.children)}
		<details>
			<summary>Observation log ({String(props.observations.length)})</summary>
			<ol class="observation-log">
				@for (const row of props.observations; key row.key) {
					<li>
						<time>{row.time as string}</time>
						<span>{row.text as string}</span>
					</li>
				}
			</ol>
		</details>
	</section>
}
