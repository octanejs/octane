// The Profiler tab: subscribes to the app-side bridge's `profile` event (Task 2's
// startBridge, which reads globalThis.__OCTANE_PROFILER__ per flush) and renders a
// ranked self-time table plus a recent-commits list. Absent a profiler global on the
// app side, no `profile` event ever arrives and the tab stays in its empty state.
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

	return <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
		@if (snapshot === null || snapshot.summaries.length === 0) {
			<em>No profiling data yet — interact with the app.</em>
		} @else {
			<>
				<h4>Slowest components (self time)</h4>
				<table>
					<thead>
						<tr>
							<th>Component</th>
							<th>Renders</th>
							<th>Self ms</th>
							<th>Max ms</th>
							<th>Queue ms</th>
							<th>Cause</th>
						</tr>
					</thead>
					<tbody>
						@for (const s of snapshot.summaries; index i) {
							<tr>
								<td>{s.component}</td>
								<td>{s.attempts as string}</td>
								<td>{fmt(s.totalSelfTime)}</td>
								<td>{fmt(s.maxInclusiveTime)}</td>
								<td>{fmt(s.averageQueueDelay)}</td>
								<td>{(s.dominantCause ?? '-') as string}</td>
							</tr>
						}
					</tbody>
				</table>
				<h4>Recent commits</h4>
				@for (const ev of snapshot.recentEvents; index i) {
					<div>
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
