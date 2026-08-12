import { Sampler, useSurfaceSampler } from '@octanejs/drei';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';

export function SamplerExternalScene(props) @{
	<Sampler
		mesh={props.meshRef}
		instances={props.instancesRef}
		count={props.count}
		weight={props.weight}
		transform={props.transform}
		position={props.position}
	/>
}

export function SamplerAutoScene(props) @{
	<Sampler count={props.count} transform={props.transform}>
		<mesh ref={props.meshRef} geometry={props.geometry} material={props.meshMaterial} />
		<instancedMesh ref={props.instancesRef} args={[props.instanceGeometry, props.instanceMaterial, props.count]} />
	</Sampler>
}

export function SurfaceSamplerScene(props) @{
	const meshRef = useRef(props.mesh);
	const buffer = useSurfaceSampler(meshRef, props.count, props.transform, props.weight, null);
	useLayoutEffect(() => props.onBuffer(buffer), [buffer, props.onBuffer]);
	null
}
