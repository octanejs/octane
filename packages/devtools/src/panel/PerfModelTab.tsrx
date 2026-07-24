// The Performance-model tab: derives aggregate "what's slow" views from the SAME
// `profile` event the Profiler tab (Task 2) already consumes — no new event, bridge
// path, or runtime probe. Where the Profiler tab shows a per-commit table, this tab
// shows ranked aggregates: slowest mounts by self time, queue-delay hotspots, and a
// recent commit self-time trend.
import { useEffect, useMemo, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient, type ProfileSnapshot } from '../client';

function fmt(ms: number): string {
	return (Math.round(ms * 10) / 10).toString();
}

export function PerfModelTab(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);

	useEffect(() => {
		const off = client.on('profile', (e) => setSnapshot(e.payload));
		return () => off();
	});

	// Aggregate views derived from the profile snapshot.
	const slowestMounts = useMemo(() => {
		if (snapshot === null) return [];
		const mounts = snapshot.recentEvents.filter((e) => e.phase === 'mount');
		return mounts.sort((a, b) => b.selfDuration - a.selfDuration).slice(0, 5);
	}, [snapshot]);

	// Excludes components already surfaced by the mounts list above — the two
	// aggregate lists are meant to highlight distinct signals (heavy initial
	// renders vs. scheduling delay), not repeat the same component twice.
	const queueHotspots = useMemo(() => {
		if (snapshot === null) return [];
		const alreadyShown = new Set(slowestMounts.map((e) => e.component));
		const others = snapshot.summaries.filter((s) => !alreadyShown.has(s.component));
		return others.sort((a, b) => b.averageQueueDelay - a.averageQueueDelay).slice(0, 5);
	}, [snapshot, slowestMounts]);

	return <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
		@if (snapshot === null || snapshot.summaries.length === 0) {
			<em>No performance data yet — interact with the app.</em>
		} @else {
			<>
				<h4>Slowest mounts (self time)</h4>
				@if (slowestMounts.length === 0) {
					<div>No mounts recorded yet.</div>
				} @else {
					@for (const e of slowestMounts; index i) {
						<div>{e.component} · {fmt(e.selfDuration)}ms</div>
					}
				}
				<h4>Queue-delay hotspots</h4>
				@if (queueHotspots.length === 0) {
					<div>No additional hotspots.</div>
				} @else {
					@for (const s of queueHotspots; index i) {
						<div>{s.component} · {fmt(s.averageQueueDelay)}ms avg queue</div>
					}
				}
				<h4>Recent commit self-time</h4>
				<div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '28px' }}>
					@for (const ev of snapshot.recentEvents; index i) {
						<div
							title={`${ev.component}: ${fmt(ev.selfDuration)}ms`}
							style={{
								width: '8px',
								height: `${Math.min(24, Math.max(2, ev.selfDuration))}px`,
								background: '#7c9cff',
							}}
						></div>
					}
				</div>
			</>
		}
	</div>;
}
