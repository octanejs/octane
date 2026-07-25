// The Profiler tab: subscribes to the app-side bridge's `profile` event (startBridge,
// which reads globalThis.__OCTANE_PROFILER__ per flush) and renders a ranked
// self-time table plus a recent-commits list. Absent a profiler global on the app
// side, no `profile` event ever arrives and the tab stays in its empty state.
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient, type ProfileSnapshot } from '../client';

function fmt(ms: number): string {
	return (Math.round(ms * 10) / 10).toString();
}

export function ProfilerTab(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);

	useEffect(() => {
		const off = client.on('profile', (e) => setSnapshot(e.payload));
		return () => off();
	});

	return <div>
		@if (snapshot === null || snapshot.summaries.length === 0) {
			<div class="odt-empty">No profiling data yet — interact with the app.</div>
		} @else {
			<>
				<div class="odt-h">Slowest components (self time)</div>
				<table class="odt-table">
					<thead>
						<tr>
							<th>Component</th>
							<th class="odt-num">Renders</th>
							<th class="odt-num">Self ms</th>
							<th class="odt-num">Max ms</th>
							<th class="odt-num">Queue ms</th>
							<th>Cause</th>
						</tr>
					</thead>
					<tbody>
						@for (const s of snapshot.summaries; index i) {
							<tr>
								<td class="odt-name-cell">{s.component}</td>
								<td class="odt-num">{s.attempts}</td>
								<td class="odt-num">{fmt(s.totalSelfTime)}</td>
								<td class="odt-num">{fmt(s.maxInclusiveTime)}</td>
								<td class="odt-num">{fmt(s.averageQueueDelay)}</td>
								<td class="odt-muted">{(s.dominantCause ?? '-') as string}</td>
							</tr>
						}
					</tbody>
				</table>
				<div class="odt-h">Recent commits</div>
				@for (const ev of snapshot.recentEvents; index i) {
					<div class="odt-commit-row">
						{ev.component}
						·
						{ev.phase}
						·
						{fmt(ev.selfDuration)}ms ·
						{ev.causes.join(',') || ev.outcome}
					</div>
				}
			</>
		}
	</div>;
}
