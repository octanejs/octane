/** @jsxImportSource @octanejs/three/intrinsics */
import { type ComputeFunction, type ThreeElements, useFrame, useThree } from '@octanejs/three';
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { RenderCubeTexture, type RenderCubeTextureApi } from './RenderCubeTexture.three.tsrx';

export type FisheyeProps = ThreeElements['mesh'] & {
	zoom?: number;
	segments?: number;
	resolution?: number;
	children: OctaneNode;
	renderPriority?: number;
};

function UpdateCubeCamera({ api }: { api: RefObject<RenderCubeTextureApi> }) @{
	const position = new THREE.Vector3();
	const rotation = new THREE.Quaternion();
	const scale = new THREE.Vector3();
	const flip = new THREE.Euler(0, Math.PI, 0);
	useFrame((state) => {
		state.camera.matrixWorld.decompose(position, rotation, scale);
		api.current?.camera.position.copy(position);
		api.current?.camera.quaternion.setFromEuler(flip).premultiply(rotation);
	});
	null
}

export function Fisheye({
	renderPriority = 1,
	zoom = 0,
	segments = 64,
	children,
	resolution = 896,
	...props
}: FisheyeProps) @{
	const sphere = useRef<THREE.Mesh | null>(null);
	const cubeApi = useRef<RenderCubeTextureApi | null>(null);
	const { width, height } = useThree((state) => state.size);
	const [camera] = useState(() => new THREE.OrthographicCamera());
	useLayoutEffect(() => {
		camera.position.set(0, 0, 100);
		camera.zoom = 100;
		camera.left = width / -2;
		camera.right = width / 2;
		camera.top = height / 2;
		camera.bottom = height / -2;
		camera.updateProjectionMatrix();
	}, [width, height]);
	const radius = (Math.sqrt(width * width + height * height) / 100) * (0.5 + zoom / 2);
	const normal = new THREE.Vector3();
	const sphereBounds = new THREE.Sphere(new THREE.Vector3(), radius);
	const normalMatrix = new THREE.Matrix3();
	const compute = useCallback<ComputeFunction>((event, state) => {
		state.pointer.set(
			((event as any).offsetX / state.size.width) * 2 - 1,
			-((event as any).offsetY / state.size.height) * 2 + 1,
		);
		state.raycaster.setFromCamera(state.pointer, camera);
		if (!state.raycaster.ray.intersectSphere(sphereBounds, normal)) return;
		normal.normalize();
		const cubeCamera = cubeApi.current?.camera;
		if (!cubeCamera) return;
		normalMatrix.getNormalMatrix(cubeCamera.matrixWorld);
		cubeCamera.getWorldPosition(state.raycaster.ray.origin);
		state.raycaster.ray.direction.set(0, 0, 1).reflect(normal);
		state.raycaster.ray.direction.x *= -1;
		state.raycaster.ray.direction.applyNormalMatrix(normalMatrix).multiplyScalar(-1);
	}, []);
	useFrame((state) => {
		if (renderPriority && sphere.current) state.gl.render(sphere.current as any, camera);
	}, renderPriority);
	<mesh ref={sphere} {...props} scale={radius}>
		<sphereGeometry args={[1, segments, segments]} />
		<meshBasicMaterial>
			<RenderCubeTexture compute={compute} attach="envMap" flip resolution={resolution} ref={cubeApi}>
				{children}
				<UpdateCubeCamera api={cubeApi as RefObject<RenderCubeTextureApi>} />
			</RenderCubeTexture>
		</meshBasicMaterial>
	</mesh>
}
