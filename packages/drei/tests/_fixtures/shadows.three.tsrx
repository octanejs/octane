import { Shadow, ShadowAlpha } from '@octanejs/drei';

export function ShadowScene(props) @{
	<Shadow
		ref={props.shadowRef}
		color={props.color}
		colorStop={props.colorStop}
		opacity={props.opacity}
		fog={props.fog}
		depthWrite={props.depthWrite}
		renderOrder={props.renderOrder}
		name="shadow"
	/>
}

export function ShadowAlphaScene(props) @{
	<mesh ref={props.meshRef}>
		<boxGeometry />
		<meshBasicMaterial opacity={props.materialOpacity} alphaMap={props.materialAlphaMap} />
		<ShadowAlpha opacity={props.opacity} alphaMap={props.alphaMap} />
	</mesh>
}
