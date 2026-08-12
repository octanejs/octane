/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, type ThreeRef, useFrame, useInstanceHandle, useThree } from '@octanejs/three';
import { useCallback, useImperativeHandle, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { DepthFormat, DepthTexture, HalfFloatType, LinearFilter, Matrix4, PerspectiveCamera, Plane, UnsignedShortType, Vector3, Vector4, WebGLRenderTarget, type Texture } from 'three';
import { BlurPass } from '../materials/BlurPass.js';
import { MeshReflectorMaterialImpl } from '../materials/MeshReflectorMaterial.js';

const MeshReflectorMaterialNode = extend(MeshReflectorMaterialImpl);

export type MeshReflectorMaterialProps = ThreeElements['meshStandardMaterial'] & {
	resolution?: number; blur?: [number, number] | number; reflectorOffset?: number; mixBlur?: number; mixStrength?: number;
	minDepthThreshold?: number; maxDepthThreshold?: number; depthScale?: number; depthToBlurRatioBias?: number; mirror?: number;
	distortion?: number; distortionMap?: Texture; mixContrast?: number;
};

export function MeshReflectorMaterial({
	mixBlur = 0, mixStrength = 1, resolution = 256, blur: blurInput = [0, 0], minDepthThreshold = 0.9,
	maxDepthThreshold = 1, depthScale = 0, depthToBlurRatioBias = 0.25, mirror = 0, distortion = 1,
	mixContrast = 1, distortionMap, reflectorOffset = 0, ref, ...props
}: MeshReflectorMaterialProps & { ref?: ThreeRef<MeshReflectorMaterialImpl> }) @{
	const gl = useThree((state) => state.gl); const camera = useThree((state) => state.camera); const scene = useThree((state) => state.scene);
	const renderer = gl as any;
	const blur = Array.isArray(blurInput) ? blurInput : [blurInput, blurInput];
	const [blurX, blurY] = blur; const hasBlur = blurX + blurY > 0;
	const materialRef = useRef<MeshReflectorMaterialImpl | null>(null); const instance = useInstanceHandle(materialRef);
	useImperativeHandle((ref ?? null) as any, () => materialRef.current!, []);
	const [reflectorPlane] = useState(() => new Plane()); const [normal] = useState(() => new Vector3());
	const [reflectorWorldPosition] = useState(() => new Vector3()); const [cameraWorldPosition] = useState(() => new Vector3());
	const [rotationMatrix] = useState(() => new Matrix4()); const [lookAtPosition] = useState(() => new Vector3(0, 0, -1));
	const [clipPlane] = useState(() => new Vector4()); const [view] = useState(() => new Vector3()); const [target] = useState(() => new Vector3());
	const [q] = useState(() => new Vector4()); const [textureMatrix] = useState(() => new Matrix4()); const [virtualCamera] = useState(() => new PerspectiveCamera());
	const beforeRender = useCallback(() => {
		const parent = instance.current?.parent?.object as any; if (!parent) return;
		reflectorWorldPosition.setFromMatrixPosition(parent.matrixWorld); cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
		rotationMatrix.extractRotation(parent.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rotationMatrix);
		reflectorWorldPosition.addScaledVector(normal, reflectorOffset); view.subVectors(reflectorWorldPosition, cameraWorldPosition);
		if (view.dot(normal) > 0) return;
		view.reflect(normal).negate().add(reflectorWorldPosition); rotationMatrix.extractRotation(camera.matrixWorld);
		lookAtPosition.set(0, 0, -1).applyMatrix4(rotationMatrix).add(cameraWorldPosition);
		target.subVectors(reflectorWorldPosition, lookAtPosition).reflect(normal).negate().add(reflectorWorldPosition);
		virtualCamera.position.copy(view); virtualCamera.up.set(0, 1, 0).applyMatrix4(rotationMatrix).reflect(normal);
		virtualCamera.lookAt(target); virtualCamera.far = camera.far; virtualCamera.updateMatrixWorld(); virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
		textureMatrix.set(0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1).multiply(virtualCamera.projectionMatrix).multiply(virtualCamera.matrixWorldInverse).multiply(parent.matrixWorld);
		reflectorPlane.setFromNormalAndCoplanarPoint(normal, reflectorWorldPosition).applyMatrix4(virtualCamera.matrixWorldInverse);
		clipPlane.set(reflectorPlane.normal.x, reflectorPlane.normal.y, reflectorPlane.normal.z, reflectorPlane.constant);
		const projection = virtualCamera.projectionMatrix;
		q.x = (Math.sign(clipPlane.x) + projection.elements[8]!) / projection.elements[0]!; q.y = (Math.sign(clipPlane.y) + projection.elements[9]!) / projection.elements[5]!;
		q.z = -1; q.w = (1 + projection.elements[10]!) / projection.elements[14]!; clipPlane.multiplyScalar(2 / clipPlane.dot(q));
		projection.elements[2] = clipPlane.x; projection.elements[6] = clipPlane.y; projection.elements[10] = clipPlane.z + 1; projection.elements[14] = clipPlane.w;
	}, [camera, reflectorOffset]);
	const [fbo1, fbo2, blurpass, reflectorProps] = useMemo(() => {
		const parameters = { minFilter: LinearFilter, magFilter: LinearFilter, type: HalfFloatType };
		const first = new WebGLRenderTarget(resolution, resolution, parameters); first.depthBuffer = true;
		first.depthTexture = new DepthTexture(resolution, resolution); first.depthTexture.format = DepthFormat; first.depthTexture.type = UnsignedShortType;
		const second = new WebGLRenderTarget(resolution, resolution, parameters);
		const pass = new BlurPass({ gl: renderer, resolution, width: blurX, height: blurY, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias });
		return [first, second, pass, { mirror, textureMatrix, mixBlur, tDiffuse: first.texture, tDepth: first.depthTexture, tDiffuseBlur: second.texture, hasBlur, mixStrength, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias, distortion, distortionMap, mixContrast,
			'defines-USE_BLUR': hasBlur ? '' : undefined, 'defines-USE_DEPTH': depthScale > 0 ? '' : undefined, 'defines-USE_DISTORTION': distortionMap ? '' : undefined } as const];
	}, [gl, blurX, blurY, textureMatrix, resolution, mirror, hasBlur, mixBlur, mixStrength, minDepthThreshold, maxDepthThreshold, depthScale, depthToBlurRatioBias, distortion, distortionMap, mixContrast]);
	useFrame(() => {
		const parent = instance.current?.parent?.object as any; if (!parent) return;
		parent.visible = false; const xr = renderer.xr.enabled; const shadow = renderer.shadowMap.autoUpdate; beforeRender(); renderer.xr.enabled = false; renderer.shadowMap.autoUpdate = false;
		renderer.setRenderTarget(fbo1); renderer.state.buffers.depth.setMask(true); if (!renderer.autoClear) renderer.clear(); renderer.render(scene, virtualCamera);
		if (hasBlur) blurpass.render(renderer, fbo1, fbo2); renderer.xr.enabled = xr; renderer.shadowMap.autoUpdate = shadow; parent.visible = true; renderer.setRenderTarget(null);
	});
	<MeshReflectorMaterialNode attach="material" key={`key${reflectorProps['defines-USE_BLUR']}${reflectorProps['defines-USE_DEPTH']}${reflectorProps['defines-USE_DISTORTION']}`} ref={materialRef} {...(reflectorProps as any)} {...(props as any)} />
}
