/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame, useThree } from '@octanejs/three';
import { useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';

export class SparklesImplMaterial extends THREE.ShaderMaterial {
	constructor() {
		super({
			uniforms: { time: { value: 0 }, pixelRatio: { value: 1 } },
			vertexShader: `uniform float pixelRatio;
uniform float time;
attribute float size;
attribute float speed;
attribute float opacity;
attribute vec3 noise;
attribute vec3 color;
varying vec3 vColor;
varying float vOpacity;
void main() {
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  modelPosition.y += sin(time * speed + modelPosition.x * noise.x * 100.0) * 0.2;
  modelPosition.z += cos(time * speed + modelPosition.x * noise.y * 100.0) * 0.2;
  modelPosition.x += cos(time * speed + modelPosition.x * noise.z * 100.0) * 0.2;
  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = size * 25. * pixelRatio;
  gl_PointSize *= (1.0 / - viewPosition.z);
  vColor = color;
  vOpacity = opacity;
}`,
			fragmentShader: `varying vec3 vColor;
varying float vOpacity;
void main() {
  float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
  float strength = 0.05 / distanceToCenter - 0.1;
  gl_FragColor = vec4(vColor, strength * vOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
		});
	}
	get time(): number { return this.uniforms.time.value; }
	set time(value: number) { this.uniforms.time.value = value; }
	get pixelRatio(): number { return this.uniforms.pixelRatio.value; }
	set pixelRatio(value: number) { this.uniforms.pixelRatio.value = value; }
}

function isFloat32Array(value: unknown): value is Float32Array {
	return Boolean(value) && (value as Float32Array).constructor === Float32Array;
}

function isVector(value: unknown): value is THREE.Vector2 | THREE.Vector3 | THREE.Vector4 {
	return value instanceof THREE.Vector2 || value instanceof THREE.Vector3 || value instanceof THREE.Vector4;
}

function normalizeVector(value: unknown): number[] {
	if (Array.isArray(value)) return value;
	if (isVector(value)) return value.toArray();
	return [value, value, value] as number[];
}

function attribute<T>(count: number, prop?: T | Float32Array, setDefault?: (value: T) => number) {
	if (prop !== undefined) {
		if (isFloat32Array(prop)) return prop;
		if (prop instanceof THREE.Color) {
			return Float32Array.from(Array.from({ length: count * 3 }, () => [prop.r, prop.g, prop.b]).flat());
		}
		if (isVector(prop) || Array.isArray(prop)) {
			return Float32Array.from(Array.from({ length: count * 3 }, () => normalizeVector(prop)).flat());
		}
		return Float32Array.from({ length: count }, () => prop as number);
	}
	return Float32Array.from({ length: count }, setDefault!);
}

export type SparklesProps = Omit<ThreeElements['points'], 'ref' | 'scale'> & {
	count?: number;
	speed?: number | Float32Array;
	opacity?: number | Float32Array;
	color?: THREE.ColorRepresentation | Float32Array;
	size?: number | Float32Array;
	scale?: number | [number, number, number] | THREE.Vector3;
	noise?: number | [number, number, number] | THREE.Vector3 | Float32Array;
};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Sparkles({
	noise = 1,
	count = 100,
	speed = 1,
	opacity = 1,
	scale = 1,
	size,
	color,
	children,
	ref,
	...props
}: SparklesProps & { ref?: ThreeRef<THREE.Points> }) @{
	const localRef = useRef<THREE.Points | null>(null);
	const dpr = useThree((state) => state.viewport.dpr);
	const normalizedScale = normalizeVector(scale);
	const positions = useMemo(
		() => Float32Array.from(Array.from({ length: count }, () => normalizedScale.map(THREE.MathUtils.randFloatSpread)).flat()),
		[count, ...normalizedScale],
	);
	const sizes = useMemo(() => attribute<number>(count, size, Math.random), [count, size]);
	const opacities = useMemo(() => attribute<number>(count, opacity), [count, opacity]);
	const speeds = useMemo(() => attribute<number>(count, speed), [count, speed]);
	const noises = useMemo(() => attribute<typeof noise>(count * 3, noise), [count, noise]);
	const colors = useMemo(
		() => attribute<THREE.ColorRepresentation>(
			color === undefined ? count * 3 : count,
			!isFloat32Array(color) ? new THREE.Color(color) : color,
			() => 1,
		),
		[count, color],
	);
	const [material] = useState(() => new SparklesImplMaterial());
	material.pixelRatio = dpr;
	material.transparent = true;
	material.depthWrite = false;
	const mergedRef = useMemo(
		() => (value: THREE.Points | null) => { localRef.current = value; assignRef(ref, value); },
		[ref],
	);
	useFrame((state) => {
		if (localRef.current?.material) (localRef.current.material as SparklesImplMaterial).time = state.clock.elapsedTime;
	});
	<points key={`particle-${count}-${JSON.stringify(scale)}`} {...props} ref={mergedRef}>
		<bufferGeometry>
			<bufferAttribute attach="attributes-position" args={[positions, 3]} />
			<bufferAttribute attach="attributes-size" args={[sizes, 1]} />
			<bufferAttribute attach="attributes-opacity" args={[opacities, 1]} />
			<bufferAttribute attach="attributes-speed" args={[speeds, 1]} />
			<bufferAttribute attach="attributes-color" args={[colors, 3]} />
			<bufferAttribute attach="attributes-noise" args={[noises, 3]} />
		</bufferGeometry>
		{children || <primitive object={material} attach="material" />}
	</points>
}
