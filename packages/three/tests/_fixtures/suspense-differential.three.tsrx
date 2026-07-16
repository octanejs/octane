function SuspendedAsset(props) @{
	const name = props.read(props.resource);
	<group ref={props.primaryRef} name={name}>
		<mesh name="asset-mesh" />
		<mesh name="authored-hidden-mesh" visible={false} />
	</group>
}

export function SuspenseDifferentialScene(props) @{
	@try {
		<SuspendedAsset resource={props.resource} read={props.read} primaryRef={props.primaryRef} />
	} @pending {
		<group ref={props.fallbackRef} name="asset-pending" />
	}
}
