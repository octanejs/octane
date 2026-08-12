/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useImperativeHandle, useLayoutEffect, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { FullScreenQuad } from 'three-stdlib';
import { CausticsMaterial, type CausticsMaterialType, CausticsProjectionMaterial, type CausticsProjectionMaterialType, createNormalMaterial } from '../materials/CausticsMaterials.js';
import { useFBO } from './Fbo.three.tsrx';
import { useHelper } from './Helper.three.tsrx';
import { Edges } from './lines.three.tsrx';

export type CausticsProps = Omit<ThreeElements['group'], 'ref'> & {
	frames?: number; debug?: boolean; causticsOnly: boolean; backside: boolean; ior?: number; backsideIOR?: number;
	worldRadius?: number; intensity?: number; color?: THREE.ColorRepresentation; resolution?: number;
	lightSource?: [x: number, y: number, z: number] | RefObject<THREE.Object3D>; children?: OctaneNode;
};

const CausticsProjectionMaterialElement = extend(CausticsProjectionMaterial);
const NORMALPROPS = { depth: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.UnsignedByteType };
const CAUSTICPROPS = { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, type: THREE.FloatType, generateMipmaps: true };

export function Caustics({
	debug, children, frames = 1, ior = 1.1, color = 'white', causticsOnly = false, backside = false,
	backsideIOR = 1.1, worldRadius = 0.3125, intensity = 0.05, resolution = 2024,
	lightSource = [5, 5, 5], ref: forwardedRef, ...props
}: CausticsProps & { ref?: ThreeRef<THREE.Group> }) @{
	const ref = useRef<THREE.Group | null>(null);
	const camera = useRef<THREE.OrthographicCamera | null>(null);
	const scene = useRef<THREE.Scene | null>(null);
	const plane = useRef<THREE.Mesh<THREE.PlaneGeometry, CausticsProjectionMaterialType> | null>(null);
	const gl = useThree((state) => state.gl);
	const helper = useHelper((debug && camera) as any, THREE.CameraHelper);
	const normalTarget = useFBO(resolution, resolution, NORMALPROPS);
	const normalTargetB = useFBO(resolution, resolution, NORMALPROPS);
	const causticsTarget = useFBO(resolution, resolution, CAUSTICPROPS);
	const causticsTargetB = useFBO(resolution, resolution, CAUSTICPROPS);
	const [normalMat] = useState(() => createNormalMaterial());
	const [normalMatB] = useState(() => createNormalMaterial(THREE.BackSide));
	const [causticsMaterial] = useState(() => new CausticsMaterial() as CausticsMaterialType);
	const [causticsQuad] = useState(() => new FullScreenQuad(causticsMaterial as any));
	useLayoutEffect(() => { ref.current!.updateWorldMatrix(false, true); });
	let count = 0;
	const v = new THREE.Vector3(); const lpF = new THREE.Frustum(); const lpM = new THREE.Matrix4(); const lpP = new THREE.Plane();
	const lightDir = new THREE.Vector3(); const lightDirInv = new THREE.Vector3(); const bounds = new THREE.Box3(); const focusPos = new THREE.Vector3();
	const boundsVertices: THREE.Vector3[] = []; const worldVerts: THREE.Vector3[] = []; const projectedVerts: THREE.Vector3[] = []; const lightDirs: THREE.Vector3[] = [];
	const cameraPos = new THREE.Vector3();
	for (let index = 0; index < 8; index++) { boundsVertices.push(new THREE.Vector3()); worldVerts.push(new THREE.Vector3()); projectedVerts.push(new THREE.Vector3()); lightDirs.push(new THREE.Vector3()); }
	useFrame(() => {
		if (frames !== Infinity && count++ >= frames) return;
		if (Array.isArray(lightSource)) lightDir.fromArray(lightSource).normalize();
		else lightDir.copy(ref.current!.worldToLocal(lightSource.current!.getWorldPosition(v)).normalize());
		lightDirInv.copy(lightDir).multiplyScalar(-1);
		scene.current!.parent?.matrixWorld.identity();
		bounds.setFromObject(scene.current!, true);
		boundsVertices[0].set(bounds.min.x, bounds.min.y, bounds.min.z); boundsVertices[1].set(bounds.min.x, bounds.min.y, bounds.max.z);
		boundsVertices[2].set(bounds.min.x, bounds.max.y, bounds.min.z); boundsVertices[3].set(bounds.min.x, bounds.max.y, bounds.max.z);
		boundsVertices[4].set(bounds.max.x, bounds.min.y, bounds.min.z); boundsVertices[5].set(bounds.max.x, bounds.min.y, bounds.max.z);
		boundsVertices[6].set(bounds.max.x, bounds.max.y, bounds.min.z); boundsVertices[7].set(bounds.max.x, bounds.max.y, bounds.max.z);
		for (let index = 0; index < 8; index++) worldVerts[index].copy(boundsVertices[index]);
		bounds.getCenter(focusPos); boundsVertices.forEach((point) => point.sub(focusPos));
		const lightPlane = lpP.set(lightDirInv, 0);
		boundsVertices.map((point, index) => lightPlane.projectPoint(point, projectedVerts[index]));
		const centralVert = projectedVerts.reduce((a, b) => a.add(b), v.set(0, 0, 0)).divideScalar(projectedVerts.length);
		const radius = projectedVerts.map((point) => point.distanceTo(centralVert)).reduce((a, b) => Math.max(a, b));
		const dirLength = boundsVertices.map((point) => point.dot(lightDir)).reduce((a, b) => Math.max(a, b));
		camera.current!.position.copy(cameraPos.copy(lightDir).multiplyScalar(dirLength).add(focusPos));
		camera.current!.lookAt(scene.current!.localToWorld(focusPos));
		const dirMatrix = lpM.lookAt(camera.current!.position, focusPos, v.set(0, 1, 0));
		camera.current!.left = -radius; camera.current!.right = radius; camera.current!.top = radius; camera.current!.bottom = -radius;
		const yOffset = v.set(0, radius, 0).applyMatrix4(dirMatrix); const yTime = (camera.current!.position.y + yOffset.y) / lightDir.y;
		camera.current!.near = 0.1; camera.current!.far = yTime; camera.current!.updateProjectionMatrix(); camera.current!.updateMatrixWorld();
		const groundProjectedCoords = worldVerts.map((point, index) => point.add(lightDirs[index].copy(lightDir).multiplyScalar(-point.y / lightDir.y)));
		const centerPos = groundProjectedCoords.reduce((a, b) => a.add(b), v.set(0, 0, 0)).divideScalar(groundProjectedCoords.length);
		const maxSize = 2 * groundProjectedCoords.map((point) => Math.hypot(point.x - centerPos.x, point.z - centerPos.z)).reduce((a, b) => Math.max(a, b));
		plane.current!.scale.setScalar(maxSize); plane.current!.position.copy(centerPos);
		if (debug) (helper.current as THREE.CameraHelper | null)?.update?.();
		normalMatB.viewMatrix.value = normalMat.viewMatrix.value = camera.current!.matrixWorldInverse;
		const dirLightNearPlane = lpF.setFromProjectionMatrix(lpM.multiplyMatrices(camera.current!.projectionMatrix, camera.current!.matrixWorldInverse)).planes[4];
		causticsMaterial.cameraMatrixWorld = camera.current!.matrixWorld; causticsMaterial.cameraProjectionMatrixInv = camera.current!.projectionMatrixInverse;
		causticsMaterial.lightDir = lightDirInv; causticsMaterial.lightPlaneNormal = dirLightNearPlane.normal; causticsMaterial.lightPlaneConstant = dirLightNearPlane.constant;
		causticsMaterial.near = camera.current!.near; causticsMaterial.far = camera.current!.far; causticsMaterial.resolution = resolution;
		causticsMaterial.size = radius; causticsMaterial.intensity = intensity; causticsMaterial.worldRadius = worldRadius;
		scene.current!.visible = true;
		gl.setRenderTarget(normalTarget); gl.clear(); scene.current!.overrideMaterial = normalMat; gl.render(scene.current!, camera.current!);
		gl.setRenderTarget(normalTargetB); gl.clear();
		if (backside) { scene.current!.overrideMaterial = normalMatB; gl.render(scene.current!, camera.current!); }
		scene.current!.overrideMaterial = null;
		causticsMaterial.ior = ior; plane.current!.material.lightProjMatrix = camera.current!.projectionMatrix; plane.current!.material.lightViewMatrix = camera.current!.matrixWorldInverse;
		causticsMaterial.normalTexture = normalTarget.texture; causticsMaterial.depthTexture = normalTarget.depthTexture;
		gl.setRenderTarget(causticsTarget); gl.clear(); causticsQuad.render(gl as any);
		causticsMaterial.ior = backsideIOR; causticsMaterial.normalTexture = normalTargetB.texture; causticsMaterial.depthTexture = normalTargetB.depthTexture;
		gl.setRenderTarget(causticsTargetB); gl.clear(); if (backside) causticsQuad.render(gl as any);
		gl.setRenderTarget(null); if (causticsOnly) scene.current!.visible = false;
	});
	useImperativeHandle((forwardedRef ?? null) as any, () => ref.current!, []);
	<group ref={ref} {...props}>
		<scene ref={scene}>
			<orthographicCamera ref={camera} up={[0, 1, 0]} />
			{children}
		</scene>
		<mesh renderOrder={2} ref={plane} rotation-x={-Math.PI / 2}>
			<planeGeometry />
			<CausticsProjectionMaterialElement transparent color={color} causticsTexture={causticsTarget.texture as any} causticsTextureB={causticsTargetB.texture as any} blending={THREE.CustomBlending} blendSrc={THREE.OneFactor} blendDst={THREE.SrcAlphaFactor} depthWrite={false} />
			@if (debug) { <Edges><lineBasicMaterial color="#ffff00" toneMapped={false} /></Edges> }
		</mesh>
	</group>
}
