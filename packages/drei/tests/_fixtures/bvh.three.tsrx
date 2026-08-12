import { Bvh, useBVH } from '@octanejs/drei';
import { useRef } from '@octanejs/three/renderer';

export function UseBvhScene(props) @{
	const mesh = useRef(null);
	useBVH(mesh, props.options);
	props.onMeshRef(mesh);
	<mesh ref={mesh} name="target">
		<boxGeometry />
		<meshBasicMaterial />
	</mesh>
}

export function BvhScene(props) @{
	<Bvh
		ref={props.groupRef}
		enabled={props.enabled}
		firstHitOnly={props.firstHitOnly}
		strategy={props.strategy}
		verbose={props.verbose}
		setBoundingBox={props.setBoundingBox}
		maxDepth={props.maxDepth}
		maxLeafTris={props.maxLeafTris}
		indirect={props.indirect}
		name="bvh"
	>
		<mesh ref={props.meshRef} name="accelerated">
			<boxGeometry />
			<meshBasicMaterial />
		</mesh>
		<mesh ref={props.skippedRef} name="skipped">
			<sphereGeometry args={[1, 8, 6]} />
			<meshBasicMaterial />
		</mesh>
	</Bvh>
}
