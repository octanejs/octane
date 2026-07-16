import { useFrame, useThree } from '@octanejs/three';
import type { RootState, ThreeEvent } from '@octanejs/three';
import { useState as useThreeState } from '@octanejs/three/renderer';
import type { Mesh } from 'three';

type ThreeBrowserProof = typeof globalThis & {
		__octaneThreeFrameCount?: number;
		__octaneThreeSceneReady?: boolean;
		__octaneThreeState?: RootState;
		__octaneThreeEventLog?: Array<Record<string, unknown>>;
		__octaneThreePointerId?: number;
		__octaneThreeRemoveOnDown?: boolean;
		__octaneThreeReleaseOnUp?: boolean;
	};

export function Scene() @{
	const proof = globalThis as ThreeBrowserProof;
	const state = useThree((value) => value);
	const [visible, setVisible] = useThreeState(true);
	let cube: Mesh | null = null;
	const record = (type: string, event: ThreeEvent<PointerEvent>) => {
		(proof.__octaneThreeEventLog ??= []).push({
			type,
			object: event.object.name,
			eventObject: event.eventObject.name,
			pointer: [event.pointer.x, event.pointer.y],
			point: [event.point.x, event.point.y, event.point.z],
			pointerId: event.pointerId,
		});
	};

	proof.__octaneThreeState = state;
	proof.__octaneThreeSceneReady = true;
	useFrame((_frameState, delta) => {
		if (cube !== null) cube.rotation.y += delta;
		proof.__octaneThreeFrameCount = (proof.__octaneThreeFrameCount ?? 0) + 1;
	});

	<>
		@if (visible) {
			<mesh
				name="bundler-proof-cube"
				ref={(value: Mesh | null) => (cube = value)}
				onPointerOver={(event) => record('over', event)}
				onPointerEnter={(event) => record('enter', event)}
				onPointerMove={(event) => record('move', event)}
				onPointerOut={(event) => record('out', event)}
				onPointerLeave={(event) => record('leave', event)}
				onPointerDown={(event) => {
					record('down', event);
					proof.__octaneThreePointerId = event.pointerId;
					event.target.setPointerCapture(event.pointerId);
					if (proof.__octaneThreeRemoveOnDown === true) setVisible(false);
				}}
				onPointerUp={(event) => {
					record('up', event);
					if (proof.__octaneThreeReleaseOnUp !== false) {
						event.target.releasePointerCapture(event.pointerId);
					}
				}}
				onClick={(event) => record('click', event)}
			>
				<boxGeometry args={[2, 2, 2]} />
				<meshBasicMaterial color={16711680} toneMapped={false} />
			</mesh>
		}
	</>
}
