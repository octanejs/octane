import { Canvas } from '/packages/octane/tests/_fixtures/universal-owned-canvas.tsrx';

function Scene() @{
	<scene />
}

export function OwnedCanvasApp() @{
	<Canvas>
		<Scene />
		<mesh />
	</Canvas>
}
