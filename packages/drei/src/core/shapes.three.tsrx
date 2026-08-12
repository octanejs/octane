/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeElements, ThreeRef } from '@octanejs/three';
import { useLayoutEffect, useRef } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';

export type Args<T> = T extends new (...args: any) => any ? ConstructorParameters<T> : T;
export type ShapeProps<T> = Omit<ThreeElements['mesh'], 'ref' | 'args'> & { args?: Args<T> };

type ShapeComponentProps<T> = ShapeProps<T> & { ref?: ThreeRef<THREE.Mesh> };
type GeometryProps<T> = { args?: Args<T> };
type GeometryComponent<T> = (props: GeometryProps<T>) => OctaneNode;

interface ShapeMeshProps<T> extends ShapeComponentProps<T> {
	Geometry: GeometryComponent<T>;
	effect?: (mesh: THREE.Mesh) => void;
}

function ShapeMesh<T>({
	Geometry,
	args,
	children,
	effect,
	ref,
	key: _key,
	...props
}: ShapeMeshProps<T>) @{
	const meshRef = useRef<THREE.Mesh | null>(null);

	useLayoutEffect(() => {
		if (meshRef.current !== null) effect?.(meshRef.current);
	});

	<mesh ref={[meshRef, ref ?? null]} {...props}>
		<Geometry args={args} />
		{children}
	</mesh>
}

function BoxGeometry(props: GeometryProps<typeof THREE.BoxGeometry>) @{
	<boxGeometry attach="geometry" args={props.args} />
}
function CircleGeometry(props: GeometryProps<typeof THREE.CircleGeometry>) @{
	<circleGeometry attach="geometry" args={props.args} />
}
function ConeGeometry(props: GeometryProps<typeof THREE.ConeGeometry>) @{
	<coneGeometry attach="geometry" args={props.args} />
}
function CylinderGeometry(props: GeometryProps<typeof THREE.CylinderGeometry>) @{
	<cylinderGeometry attach="geometry" args={props.args} />
}
function SphereGeometry(props: GeometryProps<typeof THREE.SphereGeometry>) @{
	<sphereGeometry attach="geometry" args={props.args} />
}
function PlaneGeometry(props: GeometryProps<typeof THREE.PlaneGeometry>) @{
	<planeGeometry attach="geometry" args={props.args} />
}
function TubeGeometry(props: GeometryProps<typeof THREE.TubeGeometry>) @{
	<tubeGeometry attach="geometry" args={props.args} />
}
function TorusGeometry(props: GeometryProps<typeof THREE.TorusGeometry>) @{
	<torusGeometry attach="geometry" args={props.args} />
}
function TorusKnotGeometry(props: GeometryProps<typeof THREE.TorusKnotGeometry>) @{
	<torusKnotGeometry attach="geometry" args={props.args} />
}
function TetrahedronGeometry(props: GeometryProps<typeof THREE.TetrahedronGeometry>) @{
	<tetrahedronGeometry attach="geometry" args={props.args} />
}
function RingGeometry(props: GeometryProps<typeof THREE.RingGeometry>) @{
	<ringGeometry attach="geometry" args={props.args} />
}
function PolyhedronGeometry(props: GeometryProps<typeof THREE.PolyhedronGeometry>) @{
	<polyhedronGeometry attach="geometry" args={props.args} />
}
function IcosahedronGeometry(props: GeometryProps<typeof THREE.IcosahedronGeometry>) @{
	<icosahedronGeometry attach="geometry" args={props.args} />
}
function OctahedronGeometry(props: GeometryProps<typeof THREE.OctahedronGeometry>) @{
	<octahedronGeometry attach="geometry" args={props.args} />
}
function DodecahedronGeometry(props: GeometryProps<typeof THREE.DodecahedronGeometry>) @{
	<dodecahedronGeometry attach="geometry" args={props.args} />
}
function ExtrudeGeometry(props: GeometryProps<typeof THREE.ExtrudeGeometry>) @{
	<extrudeGeometry attach="geometry" args={props.args} />
}
function LatheGeometry(props: GeometryProps<typeof THREE.LatheGeometry>) @{
	<latheGeometry attach="geometry" args={props.args} />
}
function CapsuleGeometry(props: GeometryProps<typeof THREE.CapsuleGeometry>) @{
	<capsuleGeometry attach="geometry" args={props.args} />
}
function ShapeGeometry(props: GeometryProps<typeof THREE.ShapeGeometry>) @{
	<shapeGeometry attach="geometry" args={props.args} />
}

export function Box(props: ShapeComponentProps<typeof THREE.BoxGeometry>) @{
	<ShapeMesh {...props} Geometry={BoxGeometry} />
}
export function Circle(props: ShapeComponentProps<typeof THREE.CircleGeometry>) @{
	<ShapeMesh {...props} Geometry={CircleGeometry} />
}
export function Cone(props: ShapeComponentProps<typeof THREE.ConeGeometry>) @{
	<ShapeMesh {...props} Geometry={ConeGeometry} />
}
export function Cylinder(props: ShapeComponentProps<typeof THREE.CylinderGeometry>) @{
	<ShapeMesh {...props} Geometry={CylinderGeometry} />
}
export function Sphere(props: ShapeComponentProps<typeof THREE.SphereGeometry>) @{
	<ShapeMesh {...props} Geometry={SphereGeometry} />
}
export function Plane(props: ShapeComponentProps<typeof THREE.PlaneGeometry>) @{
	<ShapeMesh {...props} Geometry={PlaneGeometry} />
}
export function Tube(props: ShapeComponentProps<typeof THREE.TubeGeometry>) @{
	<ShapeMesh {...props} Geometry={TubeGeometry} />
}
export function Torus(props: ShapeComponentProps<typeof THREE.TorusGeometry>) @{
	<ShapeMesh {...props} Geometry={TorusGeometry} />
}
export function TorusKnot(props: ShapeComponentProps<typeof THREE.TorusKnotGeometry>) @{
	<ShapeMesh {...props} Geometry={TorusKnotGeometry} />
}
export function Tetrahedron(props: ShapeComponentProps<typeof THREE.TetrahedronGeometry>) @{
	<ShapeMesh {...props} Geometry={TetrahedronGeometry} />
}
export function Ring(props: ShapeComponentProps<typeof THREE.RingGeometry>) @{
	<ShapeMesh {...props} Geometry={RingGeometry} />
}
export function Polyhedron(props: ShapeComponentProps<typeof THREE.PolyhedronGeometry>) @{
	<ShapeMesh {...props} Geometry={PolyhedronGeometry} />
}
export function Icosahedron(props: ShapeComponentProps<typeof THREE.IcosahedronGeometry>) @{
	<ShapeMesh {...props} Geometry={IcosahedronGeometry} />
}
export function Octahedron(props: ShapeComponentProps<typeof THREE.OctahedronGeometry>) @{
	<ShapeMesh {...props} Geometry={OctahedronGeometry} />
}
export function Dodecahedron(props: ShapeComponentProps<typeof THREE.DodecahedronGeometry>) @{
	<ShapeMesh {...props} Geometry={DodecahedronGeometry} />
}
export function Extrude(props: ShapeComponentProps<typeof THREE.ExtrudeGeometry>) @{
	<ShapeMesh {...props} Geometry={ExtrudeGeometry} />
}
export function Lathe(props: ShapeComponentProps<typeof THREE.LatheGeometry>) @{
	<ShapeMesh {...props} Geometry={LatheGeometry} />
}
export function Capsule(props: ShapeComponentProps<typeof THREE.CapsuleGeometry>) @{
	<ShapeMesh {...props} Geometry={CapsuleGeometry} />
}

function updateShapeUvs({ geometry }: THREE.Mesh): void {
	// Calculate UVs (by https://discourse.threejs.org/u/prisoner849).
	const pos = geometry.attributes.position as THREE.BufferAttribute;
	const bounds = new THREE.Box3().setFromBufferAttribute(pos);
	const size = new THREE.Vector3();
	bounds.getSize(size);
	const uv: number[] = [];

	for (let index = 0; index < pos.count; index++) {
		uv.push((pos.getX(index) - bounds.min.x) / size.x, (pos.getY(index) - bounds.min.y) / size.y);
	}

	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

export function Shape(props: ShapeComponentProps<typeof THREE.ShapeGeometry>) @{
	<ShapeMesh {...props} Geometry={ShapeGeometry} effect={updateShapeUvs} />
}
