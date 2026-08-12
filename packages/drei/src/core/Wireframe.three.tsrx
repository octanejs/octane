/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, useInstanceHandle } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import { universalComponent } from 'octane/universal';
import * as THREE from 'three';
import { WireframeMaterial, type WireframeMaterialProps, WireframeMaterialShaders, setWireframeOverride, useWireframeUniforms } from '../materials/WireframeMaterial.js';

interface WireframeProps { geometry?: THREE.BufferGeometry | RefObject<THREE.BufferGeometry>; simplify?: boolean }
type WithGeometry = THREE.Mesh<THREE.BufferGeometry, THREE.Material> | THREE.Line<THREE.BufferGeometry, THREE.Material> | THREE.Points<THREE.BufferGeometry, THREE.Material>;
const MeshWireframeMaterial = extend(WireframeMaterial);

function isWithGeometry(object?: THREE.Object3D | null): object is WithGeometry { return !!(object as THREE.Mesh)?.geometry; }
function isGeometry(object?: unknown | null): object is THREE.BufferGeometry { return !!(object as THREE.BufferGeometry)?.isBufferGeometry; }
function isRefObject<T>(object?: unknown | null): object is RefObject<T> { return !!(object as RefObject<T>)?.current; }
function isRef<T>(object?: unknown | null): object is RefObject<T> { return (object as RefObject<T>)?.current !== undefined; }
function isWireframeGeometry(geometry: unknown): geometry is THREE.WireframeGeometry { return (geometry as THREE.WireframeGeometry)?.type === 'WireframeGeometry'; }

function getUniforms() {
	const uniforms: Record<string, THREE.IUniform> = {};
	for (const key in WireframeMaterialShaders.uniforms) uniforms[key] = { value: WireframeMaterialShaders.uniforms[key as keyof typeof WireframeMaterialShaders.uniforms] };
	return uniforms;
}

function getBarycentricCoordinates(geometry: THREE.BufferGeometry, removeEdge?: boolean) {
	const count = geometry.getAttribute('position').count; const barycentric: number[] = [];
	for (let i = 0; i < count; i++) {
		const Q = removeEdge ? 1 : 0;
		if (i % 2 === 0) barycentric.push(0, 0, 1, 0, 1, 0, 1, 0, Q);
		else barycentric.push(0, 1, 0, 0, 0, 1, 1, 0, Q);
	}
	return new THREE.BufferAttribute(Float32Array.from(barycentric), 3);
}

function getInputGeometry(input: THREE.BufferGeometry | RefObject<THREE.BufferGeometry> | RefObject<THREE.Object3D>) {
	const geometry = isRefObject(input) ? input.current : input;
	if (!isGeometry(geometry)) {
		if (isWireframeGeometry(geometry)) throw new Error('Wireframe: WireframeGeometry is not supported.');
		const parent = geometry?.parent;
		if (isWithGeometry(parent)) {
			if (isWireframeGeometry(parent.geometry)) throw new Error('Wireframe: WireframeGeometry is not supported.');
			return parent.geometry;
		}
	} else return geometry;
}

function setBarycentricCoordinates(geometry: THREE.BufferGeometry, simplify: boolean) {
	if (geometry.index) {
		console.warn('Wireframe: Requires non-indexed geometry, converting to non-indexed geometry.');
		geometry.copy(geometry.toNonIndexed()); geometry.setIndex(null);
	}
	geometry.setAttribute('barycentric', getBarycentricCoordinates(geometry, simplify));
}

function WireframeWithCustomGeo({ geometry: customGeometry, simplify = false, ...props }: WireframeProps & WireframeMaterialProps) @{
	const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
	useLayoutEffect(() => {
		const value = getInputGeometry(customGeometry!);
		if (!value) throw new Error('Wireframe: geometry prop must be a BufferGeometry or a ref to a BufferGeometry.');
		setBarycentricCoordinates(value, simplify);
		if (isRef(customGeometry)) setGeometry(value);
	}, [simplify, customGeometry]);
	const drawnGeometry = isRef(customGeometry) ? geometry : customGeometry;
	@if (drawnGeometry) {
		<mesh geometry={drawnGeometry as THREE.BufferGeometry}>
			<MeshWireframeMaterial attach="material" transparent side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-4} {...props as any} extensions={{ derivatives: true, fragDepth: false, drawBuffers: false, shaderTextureLOD: false }} />
		</mesh>
	}
}

function WireframeWithoutCustomGeo({ simplify = false, ...props }: Omit<WireframeProps, 'geometry'> & WireframeMaterialProps) @{
	const objectRef = useRef<THREE.Object3D | null>(null);
	const instance = useInstanceHandle(objectRef);
	const uniforms = useMemo(() => getUniforms(), []);
	useWireframeUniforms(uniforms, props);
	useLayoutEffect(() => {
		const geometry = getInputGeometry(objectRef as RefObject<THREE.Object3D>);
		if (!geometry) throw new Error('Wireframe: Must be a child of a Mesh, Line or Points object or specify a geometry prop.');
		const original = geometry.clone(); setBarycentricCoordinates(geometry, simplify);
		return () => { geometry.copy(original); original.dispose(); };
	}, [simplify]);
	useLayoutEffect(() => {
		const parentMesh = instance.current!.parent!.object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
		const original = parentMesh.material.clone(); setWireframeOverride(parentMesh.material, uniforms);
		return () => { parentMesh.material.dispose(); parentMesh.material = original; };
	}, []);
	<object3D ref={objectRef as any} />
}

export function Wireframe(props: WireframeProps & WireframeMaterialProps) @{
	const component = props.geometry ? WireframeWithCustomGeo : WireframeWithoutCustomGeo;
	<>{universalComponent('three', component as any, props as unknown as Record<string, unknown>)}</>
}
