/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import * as THREE from 'three';
import { shaderMaterial } from './shaderMaterial.js';

function isLight(object: any): object is THREE.Light {
	return Boolean(object.isLight);
}

function isGeometry(object: any): object is THREE.Mesh {
	return Boolean(object.geometry);
}

export type AccumulativeShadowsProps = Omit<ThreeElements['group'], 'ref'> & {
	frames?: number;
	blend?: number;
	limit?: number;
	scale?: number;
	temporal?: boolean;
	opacity?: number;
	alphaTest?: number;
	color?: string;
	colorBlend?: number;
	resolution?: number;
	toneMapped?: boolean;
	children?: OctaneNode;
};

interface AccumulativeContext {
	lights: Map<any, AccumulativeLightContext>;
	temporal: boolean;
	frames: number;
	blend: number;
	count: number;
	getMesh: () => THREE.Mesh<THREE.PlaneGeometry, SoftShadowMaterial>;
	reset: () => void;
	update: (frames?: number) => void;
}

interface AccumulativeLightContext {
	update: () => void;
}

type SoftShadowMaterial = THREE.ShaderMaterial & {
	map: THREE.Texture;
	color: THREE.Color;
	alphaTest: number;
	blend: number;
	opacity: number;
};

export const accumulativeContext = createContext<AccumulativeContext>(null!);

const SoftShadowMaterialImpl = shaderMaterial(
	{ color: new THREE.Color(), blend: 2, alphaTest: 0.75, opacity: 0, map: null },
	`varying vec2 vUv;
   void main() {
     gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.);
     vUv = uv;
   }`,
	`varying vec2 vUv;
   uniform sampler2D map;
   uniform vec3 color;
   uniform float opacity;
   uniform float alphaTest;
   uniform float blend;
   void main() {
     vec4 sampledDiffuseColor = texture2D(map, vUv);
     gl_FragColor = vec4(color * sampledDiffuseColor.r * blend, max(0.0, (1.0 - (sampledDiffuseColor.r + sampledDiffuseColor.g + sampledDiffuseColor.b) / alphaTest)) * opacity);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
   }`,
);
const SoftShadowMaterialElement = extend(SoftShadowMaterialImpl);

const DiscardMaterial = shaderMaterial(
	{},
	'void main() { }',
	'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); discard; }',
);

class ProgressiveLightMap {
	renderer: any;
	res: number;
	scene: THREE.Scene;
	object: THREE.Mesh | null = null;
	buffer1Active = false;
	progressiveLightMap1: THREE.WebGLRenderTarget;
	progressiveLightMap2: THREE.WebGLRenderTarget;
	discardMat = new DiscardMaterial();
	targetMat = new THREE.MeshLambertMaterial({ fog: false });
	previousShadowMap: { value: THREE.Texture };
	averagingWindow = { value: 100 };
	clearColor = new THREE.Color();
	clearAlpha = 0;
	lights: Array<{ object: THREE.Light; intensity: number }> = [];
	meshes: Array<{ object: THREE.Mesh; material: THREE.Material | THREE.Material[] }> = [];

	constructor(renderer: any, scene: THREE.Scene, res = 1024) {
		this.renderer = renderer;
		this.res = res;
		this.scene = scene;
		const textureParams = { type: THREE.HalfFloatType, magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter };
		this.progressiveLightMap1 = new THREE.WebGLRenderTarget(res, res, textureParams);
		this.progressiveLightMap2 = new THREE.WebGLRenderTarget(res, res, textureParams);
		this.previousShadowMap = { value: this.progressiveLightMap1.texture };
		this.targetMat.onBeforeCompile = (shader) => {
			shader.vertexShader = `varying vec2 vUv;\n${shader.vertexShader.slice(0, -1)}vUv = uv; gl_Position = vec4((uv - 0.5) * 2.0, 1.0, 1.0); }`;
			const bodyStart = shader.fragmentShader.indexOf('void main() {');
			shader.fragmentShader = `varying vec2 vUv;\n${shader.fragmentShader.slice(0, bodyStart)}uniform sampler2D previousShadowMap;\nuniform float averagingWindow;\n${shader.fragmentShader.slice(bodyStart - 1, -1)}\nvec3 texelOld = texture2D(previousShadowMap, vUv).rgb;\ngl_FragColor.rgb = mix(texelOld, gl_FragColor.rgb, 1.0 / averagingWindow);\n}`;
			shader.uniforms.previousShadowMap = this.previousShadowMap;
			shader.uniforms.averagingWindow = this.averagingWindow;
		};
	}

	clear() {
		this.renderer.getClearColor(this.clearColor);
		this.clearAlpha = this.renderer.getClearAlpha();
		this.renderer.setClearColor('black', 1);
		this.renderer.setRenderTarget(this.progressiveLightMap1);
		this.renderer.clear();
		this.renderer.setRenderTarget(this.progressiveLightMap2);
		this.renderer.clear();
		this.renderer.setRenderTarget(null);
		this.renderer.setClearColor(this.clearColor, this.clearAlpha);
		this.lights = [];
		this.meshes = [];
		this.scene.traverse((object) => {
			if (isGeometry(object)) this.meshes.push({ object, material: object.material });
			else if (isLight(object)) this.lights.push({ object, intensity: object.intensity });
		});
	}

	prepare() {
		this.lights.forEach((light) => (light.object.intensity = 0));
		this.meshes.forEach((mesh) => (mesh.object.material = this.discardMat));
	}

	finish() {
		this.lights.forEach((light) => (light.object.intensity = light.intensity));
		this.meshes.forEach((mesh) => (mesh.object.material = mesh.material));
	}

	configure(object: THREE.Mesh) {
		this.object = object;
	}

	update(camera: THREE.Camera, blendWindow = 100) {
		if (!this.object) return;
		this.averagingWindow.value = blendWindow;
		this.object.material = this.targetMat;
		const activeMap = this.buffer1Active ? this.progressiveLightMap1 : this.progressiveLightMap2;
		const inactiveMap = this.buffer1Active ? this.progressiveLightMap2 : this.progressiveLightMap1;
		const oldBackground = this.scene.background;
		this.scene.background = null;
		this.renderer.setRenderTarget(activeMap);
		this.previousShadowMap.value = inactiveMap.texture;
		this.buffer1Active = !this.buffer1Active;
		this.renderer.render(this.scene, camera);
		this.renderer.setRenderTarget(null);
		this.scene.background = oldBackground;
	}
}

export function AccumulativeShadows({
	children,
	temporal,
	frames = 40,
	limit = Infinity,
	blend = 20,
	scale = 10,
	opacity = 1,
	alphaTest = 0.75,
	color = 'black',
	colorBlend = 2,
	resolution = 1024,
	toneMapped = true,
	ref,
	...props
}: AccumulativeShadowsProps & { ref?: ThreeRef<AccumulativeContext> }) @{
	const gl = useThree((state) => state.gl);
	const scene = useThree((state) => state.scene);
	const camera = useThree((state) => state.camera);
	const invalidate = useThree((state) => state.invalidate);
	const plane = useRef<THREE.Mesh<THREE.PlaneGeometry, SoftShadowMaterial> | null>(null);
	const lights = useRef<THREE.Group | null>(null);
	const [lightMap] = useState(() => new ProgressiveLightMap(gl, scene, resolution));
	useLayoutEffect(() => lightMap.configure(plane.current!), []);
	const api = useMemo<AccumulativeContext>(() => ({
		lights: new Map(),
		temporal: Boolean(temporal),
		frames: Math.max(2, frames),
		blend: Math.max(2, frames === Infinity ? blend : frames),
		count: 0,
		getMesh: () => plane.current!,
		reset: () => {
			lightMap.clear();
			plane.current!.material.opacity = 0;
			plane.current!.material.alphaTest = 0;
			api.count = 0;
		},
		update: (count = 1) => {
			const material = plane.current!.material;
			if (!api.temporal) {
				material.opacity = opacity;
				material.alphaTest = alphaTest;
			} else {
				material.opacity = Math.min(opacity, material.opacity + opacity / api.blend);
				material.alphaTest = Math.min(alphaTest, material.alphaTest + alphaTest / api.blend);
			}
			lights.current!.visible = true;
			lightMap.prepare();
			for (let index = 0; index < count; index++) {
				api.lights.forEach((light) => light.update());
				lightMap.update(camera, api.blend);
			}
			lights.current!.visible = false;
			lightMap.finish();
		},
	}), [lightMap, camera, scene, temporal, frames, blend, opacity, alphaTest]);
	useLayoutEffect(() => {
		api.reset();
		if (!api.temporal && api.frames !== Infinity) api.update(api.blend);
	});
	useImperativeHandle((ref ?? null) as any, () => api, [api]);
	useFrame(() => {
		if ((api.temporal || api.frames === Infinity) && api.count < api.frames && api.count < limit) {
			invalidate();
			api.update();
			api.count++;
		}
	});
	<group {...props}>
		<group {...({ traverse: () => null } as any)} ref={lights}>
			<accumulativeContext.Provider value={api}>{children}</accumulativeContext.Provider>
		</group>
		<mesh receiveShadow ref={plane as any} scale={scale} rotation={[-Math.PI / 2, 0, 0]}>
			<planeGeometry />
			<SoftShadowMaterialElement transparent depthWrite={false} toneMapped={toneMapped} color={color} blend={colorBlend} map={lightMap.progressiveLightMap2.texture as any} />
		</mesh>
	</group>
}

export type RandomizedLightProps = Omit<ThreeElements['group'], 'ref'> & {
	frames?: number;
	position?: [x: number, y: number, z: number];
	radius?: number;
	amount?: number;
	intensity?: number;
	ambient?: number;
	castShadow?: boolean;
	bias?: number;
	mapSize?: number;
	size?: number;
	near?: number;
	far?: number;
};

export function RandomizedLight({
	castShadow = true,
	bias = 0.001,
	mapSize = 512,
	size = 5,
	near = 0.5,
	far = 500,
	frames = 1,
	position = [0, 0, 0],
	radius = 1,
	amount = 8,
	intensity = Math.PI,
	ambient = 0.5,
	ref,
	...props
}: RandomizedLightProps & { ref?: ThreeRef<AccumulativeLightContext> }) @{
	const group = useRef<THREE.Group | null>(null);
	const length = new THREE.Vector3(...position).length();
	const parent = useContext(accumulativeContext);
	const update = useCallback(() => {
		if (!group.current) return;
		for (const light of group.current.children) {
			if (Math.random() > ambient) {
				light.position.set(
					position[0] + THREE.MathUtils.randFloatSpread(radius),
					position[1] + THREE.MathUtils.randFloatSpread(radius),
					position[2] + THREE.MathUtils.randFloatSpread(radius),
				);
			} else {
				const lambda = Math.acos(2 * Math.random() - 1) - Math.PI / 2;
				const phi = 2 * Math.PI * Math.random();
				light.position.set(
					Math.cos(lambda) * Math.cos(phi) * length,
					Math.abs(Math.cos(lambda) * Math.sin(phi) * length),
					Math.sin(lambda) * length,
				);
			}
		}
	}, [radius, ambient, length, ...position]);
	const api = useMemo<AccumulativeLightContext>(() => ({ update }), [update]);
	useImperativeHandle((ref ?? null) as any, () => api, [api]);
	useLayoutEffect(() => {
		if (parent && group.current) parent.lights.set(group.current.uuid, api);
		return () => { if (group.current) parent?.lights.delete(group.current.uuid); };
	}, [parent, api]);
	<group ref={group} {...props}>
		@for (const index of Array.from({ length: amount }, (_, value) => value); key index) {
			<directionalLight castShadow={castShadow} shadow-bias={bias} shadow-mapSize={[mapSize, mapSize]} intensity={intensity / amount}>
				<orthographicCamera attach="shadow-camera" args={[-size, size, size, -size, near, far]} />
			</directionalLight>
		}
	</group>
}
