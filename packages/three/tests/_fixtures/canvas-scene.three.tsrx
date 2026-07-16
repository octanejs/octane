import { useContext } from '@octanejs/three/renderer';
import { CanvasTheme } from './canvas-context.ts';

export function CanvasScene(props) @{
	<group ref={props.objectRef} name={props.name} />
}

export function ContextCanvasScene(props) @{
	const theme = useContext(CanvasTheme);
	<group ref={props.objectRef} name={theme} />
}
