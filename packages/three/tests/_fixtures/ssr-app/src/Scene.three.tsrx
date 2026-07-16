import './scene-setup.ts';
import { use } from '@octanejs/three/renderer';

interface ThreeSsrFixtureProof {
	assetStarts?: number;
	resolveAsset?: () => void;
	sceneCleanups?: number;
	sceneMounts?: number;
}

let pendingAsset: Promise<string> | undefined;

function loadPendingAsset(): Promise<string> {
	if (pendingAsset !== undefined) return pendingAsset;
	const fixture = globalThis as typeof globalThis & {
			__octaneThreeSsrProof?: ThreeSsrFixtureProof;
		};
	const proof = fixture.__octaneThreeSsrProof ??= {};
	proof.assetStarts = (proof.assetStarts ?? 0) + 1;
	pendingAsset = new Promise((resolve) => {
		proof.resolveAsset = () => resolve('hydrated-three-pending-ready');
	});
	return pendingAsset;
}

function recordSceneRef(value: unknown): void {
	const fixture = globalThis as typeof globalThis & {
			__octaneThreeSsrProof?: ThreeSsrFixtureProof;
		};
	const proof = fixture.__octaneThreeSsrProof ??= {};
	if (value === null) proof.sceneCleanups = (proof.sceneCleanups ?? 0) + 1;
	else proof.sceneMounts = (proof.sceneMounts ?? 0) + 1;
}

export function Scene(props: { mode: string }) @{
	if (props.mode === 'error') throw new Error('hydrated Three scene failed');
	const name =
		props.mode === 'pending' ? use(loadPendingAsset()) : 'hydrated-three-scene';

	<group name={name} ref={recordSceneRef}>
		<mesh name="hydrated-three-mesh">
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial color={16711680} toneMapped={false} />
		</mesh>
	</group>
}
