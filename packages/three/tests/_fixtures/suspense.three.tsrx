import { Activity, use, useLayoutEffect, useRef } from '@octanejs/three/renderer';

function Asset(props) @{
	const name =
		props.resource === null ? props.name : use(props.resource);
	<group ref={props.primaryRef} name={name}>
		<primitive object={props.external} />
		<mesh name="owned-mesh">
			<boxGeometry ref={props.geometryRef} />
		</mesh>
	</group>
}

export function SuspenseScene(props) @{
	@try {
		<Asset
			resource={props.resource}
			name={props.name}
			external={props.external}
			primaryRef={props.primaryRef}
			geometryRef={props.geometryRef}
		/>
	} @pending {
		<group ref={props.fallbackRef} name="asset-pending" />
	} @catch (error) {
		<group ref={props.errorRef} name={'asset-error:' + error.message} />
	}
}

export function ProjectedAssetScene(props) @{
	const name = use(props.resource);
	<group ref={props.objectRef} name={name} />
}

export function ProjectedErrorScene(props) @{
	if (props.error !== null) throw props.error;
	<group ref={props.objectRef} name="projected-ready" />
}

export function ActivityScene(props) @{
	<Activity mode={props.mode}>
		<group ref={props.objectRef} name="activity-object" visible={props.visible} />
	</Activity>
}

function PrimitiveAsset(props) @{
	const object = use(props.resource);
	<primitive object={object} />
}

export function PrimitiveSuspenseScene(props) @{
	@try {
		<PrimitiveAsset resource={props.resource} />
	} @pending {
		<primitive object={props.fallback} />
	}
}

function ReconstructedAsset(props) @{
	const name =
		props.resource === null ? 'reconstruction-ready' : use(props.resource);
	const objectRef = useRef(null);
	useLayoutEffect(() => props.onLayout(objectRef.current), [name, props.onLayout]);
	<group args={props.args} name={name} attach={props.attach} ref={[objectRef, props.objectRef]}>
		<group name="complete-child" />
	</group>
}

export function ReconstructionSuspenseScene(props) @{
	<group name="reconstruction-parent">
		@try {
			<ReconstructedAsset
				resource={props.resource}
				args={props.args}
				attach={props.attach}
				objectRef={props.objectRef}
				onLayout={props.onLayout}
			/>
		} @pending {
			<group name="reconstruction-pending" />
		}
	</group>
}
