/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { createContext, type OctaneNode, useContext } from 'octane';
import * as THREE from 'three';
import { FullScreenQuad } from 'three-stdlib';

export type SpotLightProps = Omit<ThreeElements['spotLight'], 'ref' | 'children'> & {
	depthBuffer?: THREE.DepthTexture;
	attenuation?: number;
	anglePower?: number;
	radiusTop?: number;
	radiusBottom?: number;
	opacity?: number;
	color?: string | number;
	volumetric?: boolean;
	debug?: boolean;
	children?: OctaneNode;
};

class SpotLightMaterial extends THREE.ShaderMaterial {
	constructor() {
		super({
			uniforms: {
				depth: { value: null },
				opacity: { value: 1 },
				attenuation: { value: 2.5 },
				anglePower: { value: 12 },
				spotPosition: { value: new THREE.Vector3(0, 0, 0) },
				lightColor: { value: new THREE.Color('white') },
				cameraNear: { value: 0 },
				cameraFar: { value: 1 },
				resolution: { value: new THREE.Vector2(0, 0) },
			},
			transparent: true,
			depthWrite: false,
			vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying float vViewZ;
        varying float vIntensity;
        uniform vec3 spotPosition;
        uniform float attenuation;

        #include <common>
        #include <logdepthbuf_pars_vertex>

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1);
          vec4 viewPosition = viewMatrix * worldPosition;
          vViewZ = viewPosition.z;
          vIntensity = 1.0 - saturate(distance(worldPosition.xyz, spotPosition) / attenuation);
          gl_Position = projectionMatrix * viewPosition;
          #include <logdepthbuf_vertex>
        }
      `,
			fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying float vViewZ;
        varying float vIntensity;
        uniform vec3 lightColor;
        uniform float anglePower;
        uniform sampler2D depth;
        uniform vec2 resolution;
        uniform float cameraNear;
        uniform float cameraFar;
        uniform float opacity;

        #include <packing>
        #include <logdepthbuf_pars_fragment>

        float readDepth(sampler2D depthSampler, vec2 uv) {
          float fragCoordZ = texture(depthSampler, uv).r;
          #ifdef USE_LOGDEPTHBUF
            float viewZ = 1.0 - exp2(fragCoordZ * log(cameraFar + 1.0) / log(2.0));
          #else
            float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
          #endif
          return viewZ;
        }

        void main() {
          #include <logdepthbuf_fragment>
          vec3 normal = vec3(vNormal.x, vNormal.y, abs(vNormal.z));
          float angleIntensity = pow(dot(normal, vec3(0, 0, 1)), anglePower);
          float intensity = vIntensity * angleIntensity;
          bool isSoft = resolution[0] > 0.0 && resolution[1] > 0.0;
          if (isSoft) {
            vec2 uv = gl_FragCoord.xy / resolution;
            intensity *= smoothstep(0.0, 1.0, vViewZ - readDepth(depth, uv));
          }
          gl_FragColor = vec4(lightColor, intensity * opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
		});
	}
}

const isSpotLight = (child: THREE.Object3D | null): child is THREE.SpotLight =>
	Boolean((child as THREE.SpotLight | null)?.isSpotLight);

function VolumetricMesh({
	opacity = 1,
	radiusTop,
	radiusBottom,
	depthBuffer,
	color = 'white',
	distance = 5,
	angle = 0.15,
	attenuation = 5,
	anglePower = 5,
}: Omit<SpotLightProps, 'volumetric'>) @{
	const mesh = useRef<THREE.Mesh | null>(null);
	const size = useThree((state) => state.size);
	const camera = useThree((state) => state.camera);
	const dpr = useThree((state) => state.viewport.dpr);
	const [material] = useState(() => new SpotLightMaterial());
	const [vector] = useState(() => new THREE.Vector3());
	const top = radiusTop === undefined ? 0.1 : radiusTop;
	const bottom = radiusBottom === undefined ? angle * 7 : radiusBottom;
	useFrame(() => {
		if (!mesh.current) return;
		material.uniforms.spotPosition.value.copy(mesh.current.getWorldPosition(vector));
		mesh.current.lookAt((mesh.current.parent as THREE.SpotLight).target.getWorldPosition(vector));
	});
	const geom = useMemo(() => {
		const value = new THREE.CylinderGeometry(top, bottom, distance, 128, 64, true);
		value.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -distance / 2, 0));
		value.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
		return value;
	}, [distance, top, bottom]);
	<mesh ref={mesh} {...({ geometry: geom, raycast: () => null } as any)}>
		<primitive
			object={material}
			attach="material"
			uniforms-opacity-value={opacity}
			uniforms-lightColor-value={color}
			uniforms-attenuation-value={attenuation}
			uniforms-anglePower-value={anglePower}
			uniforms-depth-value={depthBuffer}
			uniforms-cameraNear-value={camera.near}
			uniforms-cameraFar-value={camera.far}
			uniforms-resolution-value={depthBuffer ? [size.width * dpr, size.height * dpr] : [0, 0]}
		/>
	</mesh>
}

function useCommon(
	spotlight: { current: THREE.SpotLight | null },
	mesh: { current: THREE.Mesh | null },
	width: number,
	height: number,
	distance: number,
): void {
	const [[position, direction]] = useState(() => [new THREE.Vector3(), new THREE.Vector3()]);
	useLayoutEffect(() => {
		if (isSpotLight(spotlight.current)) {
			spotlight.current.shadow.mapSize.set(width, height);
			spotlight.current.shadow.needsUpdate = true;
		} else throw new Error('SpotlightShadow must be a child of a SpotLight');
	}, [spotlight, width, height]);
	useFrame(() => {
		if (!spotlight.current || !mesh.current) return;
		const source = spotlight.current.position;
		const target = spotlight.current.target.position;
		direction.copy(target).sub(source);
		const length = direction.length();
		direction.normalize().multiplyScalar(length * distance);
		position.copy(source).add(direction);
		mesh.current.position.copy(position);
		mesh.current.lookAt(spotlight.current.target.position);
	});
}

interface ShadowMeshProps {
	distance?: number;
	alphaTest?: number;
	scale?: number;
	map?: THREE.Texture;
	shader?: string;
	width?: number;
	height?: number;
	children?: OctaneNode;
	spotlightRef?: { current: THREE.SpotLight | null };
	debug?: boolean;
}

const SpotLightShadowContext = createContext<{
	spotlightRef: { current: THREE.SpotLight | null };
	debug: boolean;
} | null>(null);

const defaultSpotlightShadowShader = /* glsl */ `
varying vec2 vUv;

uniform sampler2D uShadowMap;
uniform float uTime;

void main() {
    vec3 color = texture2D(uShadowMap, vUv).xyz;
    gl_FragColor = vec4(color, 1.);
}
`;

function SpotlightShadowWithShader({
	distance = 0.4,
	alphaTest = 0.5,
	map,
	shader = defaultSpotlightShadowShader,
	width = 512,
	height = 512,
	scale = 1,
	children,
	spotlightRef,
	debug,
}: ShadowMeshProps) @{
	const mesh = useRef<THREE.Mesh | null>(null);
	const parent = useContext(SpotLightShadowContext);
	const activeSpotlight = spotlightRef ?? parent?.spotlightRef;
	const activeDebug = debug ?? parent?.debug;
	useCommon(activeSpotlight!, mesh, width, height, distance);
	const renderTarget = useMemo(() => new THREE.WebGLRenderTarget(width, height, {
		format: THREE.RGBAFormat,
		stencilBuffer: false,
	}), [width, height]);
	const uniforms = useRef({ uShadowMap: { value: map }, uTime: { value: 0 } });
	useEffect(() => { uniforms.current.uShadowMap.value = map; }, [map]);
	const fsQuad = useMemo(() => new FullScreenQuad(new THREE.ShaderMaterial({
		uniforms: uniforms.current,
		vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
          `,
		fragmentShader: shader,
	}) as any), [shader]);
	useEffect(() => () => {
		fsQuad.material.dispose();
		fsQuad.dispose();
	}, [fsQuad]);
	useEffect(() => () => renderTarget.dispose(), [renderTarget]);
	useFrame(({ gl }, delta) => {
		uniforms.current.uTime.value += delta;
		gl.setRenderTarget(renderTarget);
		fsQuad.render(gl as any);
		gl.setRenderTarget(null);
	});
	<mesh ref={mesh} scale={scale} castShadow>
		<planeGeometry />
		<meshBasicMaterial
			transparent
			side={THREE.DoubleSide}
			alphaTest={alphaTest}
			alphaMap={renderTarget.texture}
			alphaMap-wrapS={THREE.RepeatWrapping}
			alphaMap-wrapT={THREE.RepeatWrapping}
			opacity={activeDebug ? 1 : 0}
		>
			{children}
		</meshBasicMaterial>
	</mesh>
}

function SpotlightShadowWithoutShader({
	distance = 0.4,
	alphaTest = 0.5,
	map,
	width = 512,
	height = 512,
	scale,
	children,
	spotlightRef,
	debug,
}: ShadowMeshProps) @{
	const mesh = useRef<THREE.Mesh | null>(null);
	const parent = useContext(SpotLightShadowContext);
	const activeSpotlight = spotlightRef ?? parent?.spotlightRef;
	const activeDebug = debug ?? parent?.debug;
	useCommon(activeSpotlight!, mesh, width, height, distance);
	<mesh ref={mesh} scale={scale} castShadow>
		<planeGeometry />
		<meshBasicMaterial
			transparent
			side={THREE.DoubleSide}
			alphaTest={alphaTest}
			alphaMap={map}
			alphaMap-wrapS={THREE.RepeatWrapping}
			alphaMap-wrapT={THREE.RepeatWrapping}
			opacity={activeDebug ? 1 : 0}
		>
			{children}
		</meshBasicMaterial>
	</mesh>
}

export function SpotLightShadow(props: ShadowMeshProps) @{
	@if (props.shader) {
		<SpotlightShadowWithShader {...props} />
	} @else {
		<SpotlightShadowWithoutShader {...props} />
	}
}

export function SpotLight({
	opacity = 1,
	radiusTop,
	radiusBottom,
	depthBuffer,
	color = 'white',
	distance = 5,
	angle = 0.15,
	attenuation = 5,
	anglePower = 5,
	volumetric = true,
	debug = false,
	children,
	ref: forwardedRef,
	...props
}: SpotLightProps & { ref?: ThreeRef<THREE.SpotLight> }) @{
	const spotlight = useRef<THREE.SpotLight | null>(null);
	useImperativeHandle((forwardedRef ?? null) as any, () => spotlight.current!, []);
	<group>
		@if (debug && spotlight.current) {
			<spotLightHelper args={[spotlight.current]} />
		}
		<spotLight ref={spotlight} angle={angle} color={color} distance={distance} castShadow {...props as any}>
			@if (volumetric) {
				<VolumetricMesh
					debug={debug}
					opacity={opacity}
					radiusTop={radiusTop}
					radiusBottom={radiusBottom}
					depthBuffer={depthBuffer}
					color={color}
					distance={distance}
					angle={angle}
					attenuation={attenuation}
					anglePower={anglePower}
				/>
			}
		</spotLight>
		<SpotLightShadowContext.Provider value={{ spotlightRef: spotlight, debug }}>
			{children}
		</SpotLightShadowContext.Provider>
	</group>
}
