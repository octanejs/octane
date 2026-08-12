import {
	createInstances,
	Instance,
	InstancedAttribute,
	Instances,
	Merged,
} from '@octanejs/drei';

const [BoundInstances, BoundInstance] = createInstances();

export function InstancesScene(props) @{
	<Instances
		ref={props.ref}
		geometry={props.geometry}
		material={props.material}
		limit={props.limit}
		range={props.range}
		frames={props.frames}
		position={props.parentPosition}
	>
		<Instance ref={props.firstRef} position={props.firstPosition} scale={props.firstScale} color={props.firstColor} />
		@if (props.showSecond) {
			<Instance ref={props.secondRef} position={props.secondPosition} scale={props.secondScale} color={props.secondColor} />
		}
		<InstancedAttribute ref={props.attributeRef} name="scale" defaultValue={[1, 1, 1]} normalized={true} />
	</Instances>
}

export function RenderPropInstancesScene(props) @{
	<Instances ref={props.ref} geometry={props.geometry} material={props.material} limit={2}>
		{(LocalInstance) => <LocalInstance ref={props.instanceRef} position={[2, 3, 4]} color="hotpink" />}
	</Instances>
}

export function FactoryInstancesScene(props) @{
	<BoundInstances ref={props.ref} geometry={props.geometry} material={props.material} limit={2}>
		<BoundInstance ref={props.instanceRef} position={[3, 2, 1]} color="cyan" />
	</BoundInstances>
}

export function MergedArrayScene(props) @{
	<Merged ref={props.ref} meshes={props.meshes} limit={2}>
		{(First, Second) => <>
			<First ref={props.firstRef} position={[1, 0, 0]} />
			<Second ref={props.secondRef} position={[0, 2, 0]} />
		</>}
	</Merged>
}

export function MergedRecordScene(props) @{
	<Merged ref={props.ref} meshes={props.meshes} limit={2}>
		{(InstancesByName) => <>
			<InstancesByName.cube ref={props.cubeRef} position={[1, 0, 0]} />
			<InstancesByName.sphere ref={props.sphereRef} position={[0, 2, 0]} />
		</>}
	</Merged>
}

export function InstanceWithoutParentScene() @{
	<Instance />
}
