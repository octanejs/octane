/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { slotDefault } from './compiler-slot.js';
import { useFBO } from './Fbo.three.tsrx';
import {
	isRenderFunction,
	resolveRenderChildren,
	type RenderChildren,
} from './octane-children.js';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

type CameraChildren = RenderChildren<THREE.Texture>;

export type PerspectiveCameraProps =
	Omit<ThreeElements['perspectiveCamera'], 'ref' | 'children'> & {
		makeDefault?: boolean;
		manual?: boolean;
		children?: CameraChildren;
		frames?: number;
		resolution?: number;
		envMap?: THREE.Texture;
	};

export function PerspectiveCamera({
	envMap,
	resolution = 256,
	frames = Infinity,
	makeDefault,
	children,
	ref,
	...props
}: PerspectiveCameraProps & { ref?: ThreeRef<THREE.PerspectiveCamera> }) @{
	const set = useThree((state) => state.set);
	const camera = useThree((state) => state.camera);
	const size = useThree((state) => state.size);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const groupRef = useRef<THREE.Group | null>(null);
	const fbo = useFBO(resolution);
	const mergedRef = useMemo(
		() => (value: THREE.PerspectiveCamera | null) => {
			cameraRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => {
		if (!props.manual && cameraRef.current) cameraRef.current.aspect = size.width / size.height;
	}, [size, props]);
	useLayoutEffect(() => cameraRef.current?.updateProjectionMatrix());
	let count = 0;
	let oldEnvironment: THREE.Color | THREE.Texture | null = null;
	const functional = isRenderFunction(children);
	useFrame((state) => {
		if (
			functional && cameraRef.current && groupRef.current && (frames === Infinity || count < frames)
		) {
			groupRef.current.visible = false;
			state.gl.setRenderTarget?.(fbo);
			oldEnvironment = state.scene.background;
			if (envMap) state.scene.background = envMap;
			state.gl.render(state.scene, cameraRef.current);
			state.scene.background = oldEnvironment;
			state.gl.setRenderTarget?.(null);
			groupRef.current.visible = true;
			count++;
		}
	});
	useLayoutEffect(() => {
		if (makeDefault && cameraRef.current) {
			const oldCamera = camera;
			set(() => ({ camera: cameraRef.current! }));
			return () => set(() => ({ camera: oldCamera }));
		}
	}, [cameraRef, makeDefault, set]);
	<>
		<perspectiveCamera ref={mergedRef} {...props as any}>
			{!functional && children}
		</perspectiveCamera>
		<group ref={groupRef}>{functional && children(fbo.texture)}</group>
	</>
}

export type OrthographicCameraProps =
	Omit<ThreeElements['orthographicCamera'], 'ref' | 'children'> & {
		makeDefault?: boolean;
		manual?: boolean;
		children?: CameraChildren;
		frames?: number;
		resolution?: number;
		envMap?: THREE.Texture;
	};

export function OrthographicCamera({
	envMap,
	resolution = 256,
	frames = Infinity,
	children,
	makeDefault,
	ref,
	...props
}: OrthographicCameraProps & { ref?: ThreeRef<THREE.OrthographicCamera> }) @{
	const set = useThree((state) => state.set);
	const camera = useThree((state) => state.camera);
	const size = useThree((state) => state.size);
	const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
	const groupRef = useRef<THREE.Group | null>(null);
	const fbo = useFBO(resolution);
	const mergedRef = useMemo(
		() => (value: THREE.OrthographicCamera | null) => {
			cameraRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => {
		if (!props.manual) cameraRef.current?.updateProjectionMatrix();
	}, [size, props]);
	useLayoutEffect(() => cameraRef.current?.updateProjectionMatrix());
	useLayoutEffect(() => {
		if (makeDefault && cameraRef.current) {
			const oldCamera = camera;
			set(() => ({ camera: cameraRef.current! }));
			return () => set(() => ({ camera: oldCamera }));
		}
	}, [cameraRef, makeDefault, set]);
	let count = 0;
	let oldEnvironment: THREE.Color | THREE.Texture | null = null;
	const functional = isRenderFunction(children);
	useFrame((state) => {
		if (
			functional && cameraRef.current && groupRef.current && (frames === Infinity || count < frames)
		) {
			groupRef.current.visible = false;
			state.gl.setRenderTarget?.(fbo);
			oldEnvironment = state.scene.background;
			if (envMap) state.scene.background = envMap;
			state.gl.render(state.scene, cameraRef.current);
			state.scene.background = oldEnvironment;
			state.gl.setRenderTarget?.(null);
			groupRef.current.visible = true;
			count++;
		}
	});
	<>
		<orthographicCamera
			left={size.width / -2}
			right={size.width / 2}
			top={size.height / 2}
			bottom={size.height / -2}
			ref={mergedRef}
			{...props as any}
		>
			{!functional && children}
		</orthographicCamera>
		<group ref={groupRef}>{functional && children(fbo.texture)}</group>
	</>
}

export type CubeCameraOptions = {
	resolution?: number;
	near?: number;
	far?: number;
	envMap?: THREE.Texture;
	fog?: THREE.Fog | THREE.FogExp2;
};

export function useCubeCamera(options: CubeCameraOptions = {}) {
	const { resolution = 256, near = 0.1, far = 1000, envMap, fog } = slotDefault(options, {});
	const gl = useThree((state) => state.gl);
	const scene = useThree((state) => state.scene);
	const fbo = useMemo(() => {
		const value = new THREE.WebGLCubeRenderTarget(resolution);
		value.texture.type = THREE.HalfFloatType;
		return value;
	}, [resolution]);
	useEffect(() => () => fbo.dispose(), [fbo]);
	const camera = useMemo(() => new THREE.CubeCamera(near, far, fbo), [near, far, fbo]);
	let originalFog: THREE.Fog | THREE.FogExp2 | null;
	let originalBackground: THREE.Color | THREE.Texture | null;
	const update = useCallback(() => {
		originalFog = scene.fog;
		originalBackground = scene.background;
		scene.background = envMap || originalBackground;
		scene.fog = fog || originalFog;
		camera.update(gl as unknown as THREE.WebGLRenderer, scene);
		scene.fog = originalFog;
		scene.background = originalBackground;
	}, [gl, scene, camera]);
	return { fbo, camera, update };
}

export type CubeCameraProps =
	Omit<ThreeElements['group'], 'children'> & CubeCameraOptions & {
		children?: CameraChildren;
		frames?: number;
	};

export function CubeCamera({
	children,
	frames = Infinity,
	resolution,
	near,
	far,
	envMap,
	fog,
	...props
}: CubeCameraProps) @{
	const ref = useRef<THREE.Group | null>(null);
	const { fbo, camera, update } = useCubeCamera({ resolution, near, far, envMap, fog });
	let count = 0;
	useFrame(() => {
		if (ref.current && (frames === Infinity || count < frames)) {
			ref.current.visible = false;
			update();
			ref.current.visible = true;
			count++;
		}
	});
	<group {...props}>
		<primitive object={camera} />
		<group ref={ref}>{resolveRenderChildren(children, fbo.texture)}</group>
	</group>
}
