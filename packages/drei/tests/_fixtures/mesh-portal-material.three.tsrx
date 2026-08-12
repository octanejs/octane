import { MeshPortalMaterial } from '@octanejs/drei';

export function MeshPortalMaterialScene(props) @{
	<mesh ref={props.meshRef} name="portal-parent" position={[1, 2, 3]}>
		<planeGeometry args={[2, 1]} />
		<MeshPortalMaterial
			ref={props.materialRef}
			events={props.events}
			blur={props.blur}
			eventPriority={props.eventPriority}
			renderPriority={props.renderPriority}
			worldUnits={props.worldUnits}
			resolution={props.resolution}
		>
			<mesh name="portal-content">
				<boxGeometry />
				<meshBasicMaterial color="hotpink" />
			</mesh>
		</MeshPortalMaterial>
	</mesh>
}
