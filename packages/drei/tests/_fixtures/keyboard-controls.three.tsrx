import { KeyboardControls, useKeyboardControls } from '@octanejs/drei';

function KeyboardCapture(props) @{
	const jump = useKeyboardControls((state) => state.jump);
	const sprint = useKeyboardControls((state) => state.sprint);
	const api = useKeyboardControls();
	props.onCapture({ jump, sprint, subscribe: api[0], getState: api[1] });
	null;
}

export function KeyboardControlsScene(props) @{
	<KeyboardControls map={props.map} domElement={props.domElement} onChange={props.onChange}>
		<KeyboardCapture onCapture={props.onCapture} />
	</KeyboardControls>
}
