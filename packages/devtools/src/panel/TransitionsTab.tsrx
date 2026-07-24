// The Transitions & Suspense tab: subscribes to the app-side bridge's `transition`
// event (Task 4's startBridge, which reads the devtools hook's getTransitionState()
// per flush) and renders the live pending-transition count plus each Suspense
// boundary's state. Absent a subscriber-observed hook on the app side, no
// `transition` event ever arrives and the tab stays in its empty state.
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient, type TransitionSnapshot } from '../client';

export function TransitionsTab(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [snapshot, setSnapshot] = useState<TransitionSnapshot>({ pendingCount: 0, boundaries: [] });

	useEffect(() => {
		const off = client.on('transition', (e) => setSnapshot(e.payload));
		return () => off();
	});

	return <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
		<div>Pending transitions: {snapshot.pendingCount}</div>
		<h4>Suspense boundaries</h4>
		@if (snapshot.boundaries.length === 0) {
			<em>No Suspense boundaries.</em>
		} @else {
			@for (const b of snapshot.boundaries; index i) {
				<div>
					{b.label}
					·
					{b.state}
					{b.hasResolved ? ' (resolved once)' : ''}
				</div>
			}
		}
	</div>;
}
