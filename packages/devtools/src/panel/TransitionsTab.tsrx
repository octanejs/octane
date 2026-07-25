// The Transitions & Suspense tab: subscribes to the app-side bridge's `transition`
// event (startBridge, which reads the devtools hook's getTransitionState() per
// flush) and renders the live pending-transition count plus each Suspense boundary's
// state. Absent a subscriber-observed hook on the app side, no `transition` event
// ever arrives and the tab stays in its empty state.
import { useEffect, useState } from 'octane';
import type { OctaneNode } from 'octane';
import { OctaneDevtoolsEventClient, type BoundaryWire, type TransitionSnapshot } from '../client';

function stateClass(b: BoundaryWire): string {
	if (b.state === 'pending') return 'odt-state odt-state-pending';
	if (b.state === 'resolved') return 'odt-state odt-state-resolved';
	if (b.state === 'catch') return 'odt-state odt-state-catch';
	return 'odt-state odt-state-init';
}

export function TransitionsTab(props: { client: OctaneDevtoolsEventClient }): OctaneNode {
	const { client } = props;
	const [snapshot, setSnapshot] = useState<TransitionSnapshot>({ pendingCount: 0, boundaries: [] });

	useEffect(() => {
		const off = client.on('transition', (e) => setSnapshot(e.payload));
		return () => off();
	});

	return <div>
		<div class="odt-stat">Pending transitions: {snapshot.pendingCount}</div>
		<div class="odt-h">Suspense boundaries</div>
		@if (snapshot.boundaries.length === 0) {
			<div class="odt-empty">No Suspense boundaries.</div>
		} @else {
			@for (const b of snapshot.boundaries; index i) {
				<div class="odt-boundary">
					<span class={stateClass(b)}>{b.state}</span>
					<span>{b.label}</span>
					@if (b.hasResolved && b.state !== 'resolved') {
						<span class="odt-muted">resolved once</span>
					}
				</div>
			}
		}
	</div>;
}
