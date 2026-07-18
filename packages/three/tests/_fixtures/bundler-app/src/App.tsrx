import { Canvas } from '@octanejs/three';
import { Scene } from './Scene.three.tsrx';

export function App() @{
	const onPointerMissed = (event) => {
		const proof = globalThis as typeof globalThis & {
				__octaneThreeEventLog?: Array<Record<string, unknown>>;
			};
		(proof.__octaneThreeEventLog ??= []).push({
			type: 'root-miss',
			nativeType: event.type,
		});
	};

	<main
		data-octane-three-app="ready"
		style={{ width: '64px', height: '64px', marginLeft: '24px', marginTop: '16px' }}
	>
		<Canvas
			frameloop="never"
			dpr={1}
			camera={{ position: [0, 0, 5] }}
			onPointerMissed={onPointerMissed}
		>
			<Scene />
		</Canvas>
	</main>
}

export function WebGLFailureApp() @{
	<main
		data-octane-three-app="webgl-failure"
		style={{ width: '64px', height: '64px', marginLeft: '24px', marginTop: '16px' }}
	>
		@try {
			<Canvas frameloop="never" dpr={1}>
				<Scene />
			</Canvas>
		} @catch (error) {
			<p data-three-webgl-error="">
				{error.message as string}
			</p>
		}
	</main>
}
