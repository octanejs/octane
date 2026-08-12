import { Hud } from '@octanejs/drei';

export function HudScene(props) @{
	<>
		<group name="main-scene" />
		<Hud renderPriority={props.renderPriority}>
			<mesh name="hud-content" />
		</Hud>
	</>
}
