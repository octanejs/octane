import { Canvas } from '@octanejs/three';
import { CanvasTheme } from './canvas-context.ts';
import { CanvasScene, ContextCanvasScene } from './canvas-scene.three.tsrx';

export function CanvasApp(props) @{
	<Canvas
		ref={props.canvasRef}
		gl={props.gl}
		frameloop="never"
		raycaster={props.raycaster}
		onCreated={props.onCreated}
		fallback={<span class="canvas-fallback">{'WebGL unavailable'}</span>}
		className="canvas-shell"
		data-label={props.label}
		style={{ position: 'absolute', backgroundColor: props.background }}
	>
		<CanvasScene objectRef={props.objectRef} name={props.name} />
	</Canvas>
}

export function EmptyCanvasApp(props) @{
	<Canvas gl={props.gl} frameloop="never" onCreated={props.onCreated} />
}

export function CanvasErrorApp(props) @{
	@try {
		<Canvas gl={props.gl} frameloop="never" onPointerMissed={props.onPointerMissed}>
			<CanvasScene name="never-mounted" />
		</Canvas>
	} @catch (error) {
		<p class="canvas-error">
			{error.message as string}
		</p>
	}
}

export function ContextCanvasApp(props) @{
	<CanvasTheme.Provider value={props.theme}>
		<Canvas gl={props.gl} frameloop="never">
			<ContextCanvasScene objectRef={props.objectRef} />
		</Canvas>
	</CanvasTheme.Provider>
}
