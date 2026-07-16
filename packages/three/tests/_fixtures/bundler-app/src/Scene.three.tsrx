import { useFrame, useLoader, useThree } from '@octanejs/three';
import type { RootState, ThreeEvent } from '@octanejs/three';
import { useState as useThreeState } from '@octanejs/three/renderer';
import { FileLoader } from 'three';
import type { Mesh } from 'three';

type ThreeBrowserProof = typeof globalThis & {
		__octaneThreeFrameCount?: number;
		__octaneThreeAsset?: string;
		__octaneThreeSceneReady?: boolean;
		__octaneThreeState?: RootState;
		__octaneThreeEventLog?: Array<Record<string, unknown>>;
		__octaneThreePointerId?: number;
		__octaneThreeRemoveOnDown?: boolean;
		__octaneThreeReleaseOnUp?: boolean;
	};

function BrowserAsset(props) @{
	const proof = globalThis as ThreeBrowserProof;
	const asset = useLoader(FileLoader, '/three-loader-proof.txt');
	if (typeof asset !== 'string') throw new Error('The browser loader returned a non-text asset.');
	proof.__octaneThreeAsset = asset;
	<group name={'browser-asset-' + props.copy + ':' + asset.trim()} />
}

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
		@try {
			<>
				<BrowserAsset copy="first" />
				<BrowserAsset copy="second" />
			</>
		} @pending {
			<group name="browser-asset-pending" />
		}
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
