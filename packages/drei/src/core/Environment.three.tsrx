/** @jsxImportSource @octanejs/three/intrinsics */
import {
	applyProps,
	createPortal,
	extend,
	type ThreeElement,
	useFrame,
	useThree,
} from '@octanejs/three';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import { universalComponent } from 'octane/universal';
import {
	CubeCamera,
	type CubeTexture,
	type Euler,
	HalfFloatType,
	Scene,
	type Texture,
	WebGLCubeRenderTarget,
} from 'three';
import { GroundProjectedEnv as GroundProjectedEnvImpl } from 'three-stdlib';
import type { EnvironmentLoaderProps } from './environment-loader.js';
import { useEnvironment } from './useEnvironment.three.tsrx';

export type EnvironmentProps = {
	children?: OctaneNode;
	frames?: number;
	near?: number;
	far?: number;
	resolution?: number;
	background?: boolean | 'only';
	blur?: number;
	backgroundBlurriness?: number;
	backgroundIntensity?: number;
	backgroundRotation?: Euler;
	environmentIntensity?: number;
	environmentRotation?: Euler;
	map?: Texture;
	scene?: Scene | RefObject<Scene>;
	ground?: boolean | { radius?: number; height?: number; scale?: number };
} & EnvironmentLoaderProps;

function isSceneRef(scene: Scene | RefObject<Scene>): scene is RefObject<Scene> {
	return Boolean(scene && 'current' in scene && scene.current?.isScene);
}

function resolveScene(scene: Scene | RefObject<Scene>): Scene {
	return isSceneRef(scene) ? scene.current! : scene;
}

function setEnvironmentProperties(
	background: boolean | 'only',
	scene: Scene | RefObject<Scene> | undefined,
	defaultScene: Scene,
	texture: Texture,
	sceneProps: Partial<EnvironmentProps> = {},
): () => void {
	const nextProps = {
		backgroundBlurriness: 0,
		backgroundIntensity: 1,
		backgroundRotation: [0, 0, 0],
		environmentIntensity: 1,
		environmentRotation: [0, 0, 0],
		...sceneProps,
	};
	const target = resolveScene(scene ?? defaultScene);
	const oldBackground = target.background;
	const oldEnvironment = target.environment;
	const oldSceneProps = {
		backgroundBlurriness: target.backgroundBlurriness,
		backgroundIntensity: target.backgroundIntensity,
		backgroundRotation: target.backgroundRotation?.clone?.() ?? [0, 0, 0],
		environmentIntensity: target.environmentIntensity,
		environmentRotation: target.environmentRotation?.clone?.() ?? [0, 0, 0],
	};
	if (background !== 'only') target.environment = texture;
	if (background) target.background = texture;
	applyProps(target as any, nextProps as any);
	return () => {
		if (background !== 'only') target.environment = oldEnvironment;
		if (background) target.background = oldBackground;
		applyProps(target as any, oldSceneProps as any);
	};
}

export function EnvironmentMap({
	scene,
	background = false,
	map,
	...config
}: EnvironmentProps) @{
	const defaultScene = useThree((state) => state.scene);
	useLayoutEffect(() => {
		if (map) return setEnvironmentProperties(background, scene, defaultScene, map, config);
	});
	null
}

export function EnvironmentCube({
	background = false,
	scene,
	blur,
	backgroundBlurriness,
	backgroundIntensity,
	backgroundRotation,
	environmentIntensity,
	environmentRotation,
	...loaderOptions
}: EnvironmentProps) @{
	const texture = useEnvironment(loaderOptions);
	const defaultScene = useThree((state) => state.scene);
	useLayoutEffect(() => setEnvironmentProperties(background, scene, defaultScene, texture, {
		backgroundBlurriness: blur ?? backgroundBlurriness,
		backgroundIntensity,
		backgroundRotation,
		environmentIntensity,
		environmentRotation,
	}));
	useEffect(() => () => texture.dispose(), [texture]);
	null
}

export function EnvironmentPortal({
	children,
	near = 0.1,
	far = 1000,
	resolution = 256,
	frames = 1,
	map,
	background = false,
	blur,
	backgroundBlurriness,
	backgroundIntensity,
	backgroundRotation,
	environmentIntensity,
	environmentRotation,
	scene,
	files,
	path,
	preset,
	extensions,
}: EnvironmentProps) @{
	const gl = useThree((state) => state.gl);
	const defaultScene = useThree((state) => state.scene);
	const camera = useRef<CubeCamera | null>(null);
	const [virtualScene] = useState(() => new Scene());
	const target = useMemo(() => {
		const value = new WebGLCubeRenderTarget(resolution);
		value.texture.type = HalfFloatType;
		return value;
	}, [resolution]);
	useEffect(() => () => target.dispose(), [target]);
	useLayoutEffect(() => {
		if (frames === 1 && camera.current) {
			const autoClear = gl.autoClear;
			gl.autoClear = true;
			camera.current.update(gl as any, virtualScene);
			gl.autoClear = autoClear;
		}
		return setEnvironmentProperties(background, scene, defaultScene, target.texture, {
			backgroundBlurriness: blur ?? backgroundBlurriness,
			backgroundIntensity,
			backgroundRotation,
			environmentIntensity,
			environmentRotation,
		});
	}, [children, virtualScene, target.texture, scene, defaultScene, background, frames, gl]);
	let count = 1;
	useFrame(() => {
		if ((frames === Infinity || count < frames) && camera.current) {
			const autoClear = gl.autoClear;
			gl.autoClear = true;
			camera.current.update(gl as any, virtualScene);
			gl.autoClear = autoClear;
			count++;
		}
	});
	<>
		{createPortal(
			<>
				{children}
				<cubeCamera ref={camera} args={[near, far, target]} />
				@if (files || preset) {
					<EnvironmentCube background={true} files={files} preset={preset} path={path} extensions={extensions} />
				} @else if (map) {
					<EnvironmentMap background={true} map={map} extensions={extensions} />
				}
			</>,
			virtualScene,
		)}
	</>
}

const GroundProjectedEnvElement = extend(GroundProjectedEnvImpl);

function EnvironmentGround(props: EnvironmentProps) @{
	const textureDefault = useEnvironment(props);
	const texture = props.map ?? textureDefault;
	useEffect(() => () => textureDefault.dispose(), [textureDefault]);
	const args = useMemo<[CubeTexture | Texture]>(() => [texture], [texture]);
	const height = typeof props.ground === 'object' ? props.ground.height : undefined;
	const radius = typeof props.ground === 'object' ? props.ground.radius : undefined;
	const scale = typeof props.ground === 'object' ? props.ground.scale ?? 1000 : 1000;
	<>
		<EnvironmentMap {...props} map={texture} />
		<GroundProjectedEnvElement args={args as any} scale={scale} height={height} radius={radius} />
	</>
}

export function Environment(props: EnvironmentProps) @{
	const component = props.ground
		? EnvironmentGround
		: props.map
			? EnvironmentMap
			: props.children
				? EnvironmentPortal
				: EnvironmentCube;
	<>{universalComponent('three', component as any, props as unknown as Record<string, unknown>)}</>
}
