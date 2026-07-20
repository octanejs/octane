import { useState } from 'octane';
import { Canvas } from '@octanejs/three';
import type { RootState } from '@octanejs/three';
import { Scene } from './Scene.three.tsrx';

interface ThreeSsrFixtureProof {
	created?: number;
	disposals?: number;
	rootSceneIds?: string[];
	state?: RootState;
}

function recordCreated(state: RootState): void {
	const fixture = globalThis as typeof globalThis & {
			__octaneThreeSsrProof?: ThreeSsrFixtureProof;
		};
	const proof = fixture.__octaneThreeSsrProof ??= {};
	proof.created = (proof.created ?? 0) + 1;
	(proof.rootSceneIds ??= []).push(state.scene.uuid);
	proof.state = state;

	const dispose = state.gl.dispose.bind(state.gl);
	let disposed = false;
	state.gl.dispose = () => {
		if (!disposed) {
			disposed = true;
			proof.disposals = (proof.disposals ?? 0) + 1;
		}
		dispose();
	};
}

export function Page(props: { params: Record<string, string> }) @{
	const [mounted, setMounted] = useState(true);
	const mode = props.params.mode ?? 'ready';

	<main data-three-page={mode}>
		<h1>{'Three SSR ' + mode}</h1>
		<button onClick={() => setMounted(false)}>Unmount Canvas</button>
		@if (mounted) {
			@try {
				<Canvas
					data-three-canvas-shell=""
					style={{ width: '64px', height: '64px' }}
					frameloop="never"
					dpr={1}
					onCreated={recordCreated}
					fallback={<span data-three-native-fallback="">WebGL unavailable</span>}
				>
					<Scene mode={mode} />
				</Canvas>
			} @pending {
				<p data-three-pending="">Loading Three scene</p>
			} @catch (error) {
				<p data-three-error="">
					{error.message as string}
				</p>
			}
		}
	</main>
}
