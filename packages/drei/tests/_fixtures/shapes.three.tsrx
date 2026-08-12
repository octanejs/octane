/** @jsxImportSource @octanejs/three/intrinsics */
import {
	Box,
	Capsule,
	Circle,
	Cone,
	Cylinder,
	Dodecahedron,
	Extrude,
	Icosahedron,
	Lathe,
	Octahedron,
	Plane,
	Polyhedron,
	Ring,
	Shape,
	Sphere,
	Tetrahedron,
	Torus,
	TorusKnot,
	Tube,
} from '@octanejs/drei';

const components = {
	Box,
	Capsule,
	Circle,
	Cone,
	Cylinder,
	Dodecahedron,
	Extrude,
	Icosahedron,
	Lathe,
	Octahedron,
	Plane,
	Polyhedron,
	Ring,
	Shape,
	Sphere,
	Tetrahedron,
	Torus,
	TorusKnot,
	Tube,
};

export function ShapeScene(props) @{
	const Component = components[props.name];
	<Component ref={props.meshRef} args={props.args} name="parity-shape" position={[1, 2, 3]}>
		<meshBasicMaterial color="hotpink" />
	</Component>
}
