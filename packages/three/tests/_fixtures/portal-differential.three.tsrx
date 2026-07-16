function PortalMesh(props) @{
	<mesh name={props.item.name} position={props.item.position}>
		<boxGeometry args={props.item.size} />
		<meshBasicMaterial color={props.item.color} />
	</mesh>
}

export function PortalDifferentialScene(props) @{
	<group name="logical-root">
		<group name="root-owned" />
		<>
			{props.portal(
				<group name={props.portalName} position={props.portalPosition}>
					@for (const item of props.items; key item.id) {
						<PortalMesh item={item} />
					}
				</group>,
				props.target,
			)}
		</>
	</group>
}
