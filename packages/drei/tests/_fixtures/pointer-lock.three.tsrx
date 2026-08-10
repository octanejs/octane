import { PointerLockControls } from '@octanejs/drei';

export function PointerLockScene(props) @{
	<PointerLockControls
		ref={props.controlRef}
		selector={props.selector}
		enabled={props.enabled}
		makeDefault={props.makeDefault}
		onChange={props.onChange}
		onLock={props.onLock}
		onUnlock={props.onUnlock}
	/>
}
