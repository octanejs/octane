import type { BufferGeometry, Mesh } from 'three';

export interface HmrProbe {
	events: string[];
	geometryRef: (value: BufferGeometry | null) => void;
	meshRef: (value: Mesh | null) => void;
}

function InitialHmrScene({ probe }: { probe: HmrProbe }) @{
	<mesh
		args={[]}
		name="hmr-initial"
		position={[1, 0, 0]}
		ref={probe.meshRef}
		renderOrder={7}
		onPointerDown={() => probe.events.push('initial')}
	>
		<boxGeometry args={[1, 1, 1]} ref={probe.geometryRef} />
	</mesh>
}

function CompatibleHmrScene({ probe }: { probe: HmrProbe }) @{
	<mesh
		args={[]}
		name="hmr-compatible"
		position={[2, 0, 0]}
		ref={probe.meshRef}
		onPointerDown={() => probe.events.push('compatible')}
	>
		<boxGeometry args={[1, 1, 1]} ref={probe.geometryRef} />
	</mesh>
}

function ReconstructedHmrScene({ probe }: { probe: HmrProbe }) @{
	<mesh
		args={[undefined, undefined]}
		name="hmr-reconstructed"
		position={[3, 0, 0]}
		ref={probe.meshRef}
		onPointerDown={() => probe.events.push('reconstructed')}
	>
		<boxGeometry args={[2, 2, 2]} ref={probe.geometryRef} />
	</mesh>
}

// The test applies the same canonical wrapper handoff emitted by Vite/Rspack.
// Returning unwrapped implementations keeps each simulated module evaluation
// independent from Vitest's own HMR wrapper around exported components.
export function getInitialHmrScene() {
	return InitialHmrScene;
}

export function getCompatibleHmrScene() {
	return CompatibleHmrScene;
}

export function getReconstructedHmrScene() {
	return ReconstructedHmrScene;
}
