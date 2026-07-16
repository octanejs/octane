import { Canvas } from '@octanejs/three';
import { Scene } from './Scene.three.tsrx';

export function App() @{
	<main data-octane-three-app="ready" style={{ width: '64px', height: '64px' }}>
		<Canvas frameloop="never" dpr={1} camera={{ position: [0, 0, 5] }}>
			<Scene />
		</Canvas>
	</main>
}
