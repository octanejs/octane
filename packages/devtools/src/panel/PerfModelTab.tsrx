// The Performance-model tab: derives aggregate "what's slow" views from the SAME
// `profile` event the Profiler tab already consumes — no new event, bridge path, or
// runtime probe. Where the Profiler tab shows a per-commit table, this tab shows
// ranked aggregates: slowest mounts by self time, queue-delay hotspots, and a recent
// commit self-time trend.
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
	// aggregate lists highlight distinct signals (heavy initial renders vs.
	// scheduling delay), not the same component twice.
	const queueHotspots = useMemo(() => {
		if (snapshot === null) return [];
		const alreadyShown = new Set(slowestMounts.map((e) => e.component));
		const others = snapshot.summaries.filter((s) => !alreadyShown.has(s.component));
		return others.sort((a, b) => b.averageQueueDelay - a.averageQueueDelay).slice(0, 5);
	}, [snapshot, slowestMounts]);

	const maxSelf = useMemo(() => {
		if (snapshot === null) return 1;
		return Math.max(1, ...snapshot.recentEvents.map((e) => e.selfDuration));
	}, [snapshot]);

	return <div>
		@if (snapshot === null || snapshot.summaries.length === 0) {
			<div class="odt-empty">No performance data yet — interact with the app.</div>
		} @else {
			<>
				<div class="odt-h">Slowest mounts (self time)</div>
				@if (slowestMounts.length === 0) {
					<div class="odt-empty odt-muted">No mounts recorded yet.</div>
				} @else {
					@for (const e of slowestMounts; index i) {
						<div class="odt-commit-row">
							<span class="odt-name-cell">{e.component}</span>
							<span
								class="odt-bar"
								style={{ width: `${Math.max(6, (e.selfDuration / maxSelf) * 120)}px` }}
							></span>
							<span class="odt-num">{fmt(e.selfDuration)}ms</span>
						</div>
					}
				}
				<div class="odt-h">Queue-delay hotspots</div>
				@if (queueHotspots.length === 0) {
					<div class="odt-empty odt-muted">No additional hotspots.</div>
				} @else {
					@for (const s of queueHotspots; index i) {
						<div class="odt-commit-row">
							<span class="odt-name-cell">{s.component}</span>
							<span class="odt-muted">{fmt(s.averageQueueDelay)}ms avg queue</span>
						</div>
					}
				}
				<div class="odt-h">Recent commit self-time</div>
				<div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '30px' }}>
					@for (const ev of snapshot.recentEvents; index i) {
						<span
							class="odt-bar"
							title={`${ev.component}: ${fmt(ev.selfDuration)}ms`}
							style={{
								width: '7px',
								height: `${Math.min(28, Math.max(2, (ev.selfDuration / maxSelf) * 28))}px`,
							}}
						></span>
					}
				</div>
			</>
		}
	</div>;
}
