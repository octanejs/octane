/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ComputeFunction, type ThreeElements, type ThreeRef, useFrame, useInstanceHandle, useThree } from '@octanejs/three';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { FullScreenQuad } from 'three-stdlib';
import { PortalMaterialImpl, type PortalMaterialInstance } from '../materials/PortalMaterial.js';
import { makeSDFGenerator } from '../materials/makeSDFGenerator.js';
import { useFBO } from './Fbo.three.tsrx';
import { RenderTexture } from './RenderTexture.three.tsrx';
import { useIntersect } from './useIntersect.three.tsrx';

export type PortalProps = Omit<ThreeElements['shaderMaterial'], 'ref'> & {
	blend?: number; blur?: number; resolution?: number; worldUnits?: boolean; eventPriority?: number;
	renderPriority?: number; events?: boolean; children?: OctaneNode;
};
const PortalMaterialNode = extend(PortalMaterialImpl);

export function MeshPortalMaterial({
	children, events = undefined, blur = 0, eventPriority = 0, renderPriority = 0, worldUnits = false,
	resolution = 512, ref: forwardedRef, ...props
}: PortalProps & { ref?: ThreeRef<PortalMaterialInstance> }) @{
	const ref = useRef<PortalMaterialInstance | null>(null);
	const instance = useInstanceHandle(ref);
	const { scene, gl, size, viewport, setEvents } = useThree();
	const maskRenderTarget = useFBO(resolution, resolution);
	const [priority, setPriority] = useState(0);
	useFrame(() => {
		const next = ref.current!.blend > 0 ? Math.max(1, renderPriority) : 0;
		if (priority !== next) setPriority(next);
	});
	useEffect(() => { if (events !== undefined) setEvents({ enabled: !events }); }, [events]);
	const [visible, setVisible] = useState(true);
	const parent = useIntersect<THREE.Mesh<THREE.BufferGeometry>>(setVisible);
	useLayoutEffect(() => { parent.current = instance.current?.parent?.object as THREE.Mesh<THREE.BufferGeometry> | null; }, []);
	useLayoutEffect(() => {
		if (!parent.current || !blur || ref.current!.sdf !== null) return;
		const tempMesh = new THREE.Mesh(parent.current.geometry, new THREE.MeshBasicMaterial());
		const boundingBox = new THREE.Box3().setFromBufferAttribute(tempMesh.geometry.attributes.position as THREE.BufferAttribute);
		const orthoCam = new THREE.OrthographicCamera(
			boundingBox.min.x * (1 + 2 / resolution), boundingBox.max.x * (1 + 2 / resolution),
			boundingBox.max.y * (1 + 2 / resolution), boundingBox.min.y * (1 + 2 / resolution), 0.1, 1000,
		);
		orthoCam.position.set(0, 0, 1); orthoCam.lookAt(0, 0, 0);
		gl.setRenderTarget(maskRenderTarget); (gl as any).render(tempMesh, orthoCam);
		const sdf = makeSDFGenerator(resolution, resolution, gl as any)(maskRenderTarget.texture);
		const readSdf = new Float32Array(resolution * resolution); gl.readRenderTargetPixels(sdf, 0, 0, resolution, resolution, readSdf);
		let min = Infinity; for (let index = 0; index < readSdf.length; index++) if (readSdf[index] < min) min = readSdf[index];
		ref.current!.size = -min; (ref.current as any).sdf = sdf.texture; gl.setRenderTarget(null);
	}, [resolution, blur]);
	useImperativeHandle((forwardedRef ?? null) as any, () => ref.current!);
	const compute = useCallback<ComputeFunction>((event, state) => {
		if (!parent.current) return false as any;
		state.pointer.set((event.offsetX / state.size.width) * 2 - 1, -(event.offsetY / state.size.height) * 2 + 1);
		state.raycaster.setFromCamera(state.pointer, state.camera);
		if (ref.current?.blend === 0) {
			const [intersection] = state.raycaster.intersectObject(parent.current);
			if (!intersection) { (state.raycaster as any).camera = undefined; return false as any; }
		}
	}, []);
	<PortalMaterialNode ref={ref} blur={blur} blend={0} resolution={[size.width * viewport.dpr, size.height * viewport.dpr]} attach="material" {...props as any}>
		<RenderTexture attach="map" frames={visible ? Infinity : 0} eventPriority={eventPriority} renderPriority={renderPriority} compute={compute}>
			{children}
			<ManagePortalScene events={events} rootScene={scene} priority={priority} material={ref} parent={parent} worldUnits={worldUnits} />
		</RenderTexture>
	</PortalMaterialNode>
}

function ManagePortalScene({ events = undefined, rootScene, material, parent, priority, worldUnits }: {
	events?: boolean; rootScene: THREE.Scene; material: RefObject<PortalMaterialInstance>; parent: RefObject<THREE.Mesh<THREE.BufferGeometry>>;
	priority: number; worldUnits: boolean;
}) @{
	const scene = useThree((state) => state.scene); const setEvents = useThree((state) => state.setEvents);
	const buffer1 = useFBO(); const buffer2 = useFBO();
	useLayoutEffect(() => { scene.matrixAutoUpdate = false; }, []);
	useEffect(() => { if (events !== undefined) setEvents({ enabled: events }); }, [events]);
	const [quad, blend] = useMemo(() => {
		const blend = { value: 0 };
		const quad = new FullScreenQuad(new THREE.ShaderMaterial({
			uniforms: { a: { value: buffer1.texture }, b: { value: buffer2.texture }, blend },
			vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: `uniform sampler2D a; uniform sampler2D b; uniform float blend; varying vec2 vUv; #include <packing>
				void main() { vec4 ta = texture2D(a, vUv); vec4 tb = texture2D(b, vUv); gl_FragColor = mix(tb, ta, blend); #include <tonemapping_fragment> #include <colorspace_fragment> }`,
		}) as any);
		return [quad, blend] as const;
	}, []);
	useFrame((state) => {
		if (!parent.current) return;
		if (!worldUnits) {
			if (priority && material.current?.blend === 1) parent.current.updateWorldMatrix(true, false);
			scene.matrixWorld.copy(parent.current.matrixWorld);
		} else scene.matrixWorld.identity();
		if (priority) {
			if (material.current!.blend > 0 && material.current!.blend < 1) {
				blend.value = material.current!.blend;
				state.gl.setRenderTarget(buffer1); state.gl.render(scene, state.camera);
				state.gl.setRenderTarget(buffer2); state.gl.render(rootScene, state.camera);
				state.gl.setRenderTarget(null); quad.render(state.gl as any);
			} else if (material.current!.blend === 1) state.gl.render(scene, state.camera);
		}
	}, priority);
	null
}
