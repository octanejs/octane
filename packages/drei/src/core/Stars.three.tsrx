/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeRef, useFrame } from '@octanejs/three';
import { useMemo, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';

export type StarsProps = {
	radius?: number;
	depth?: number;
	count?: number;
	factor?: number;
	saturation?: number;
	fade?: boolean;
	speed?: number;
};

export class StarfieldMaterial extends THREE.ShaderMaterial {
	constructor() {
		super({
			uniforms: { time: { value: 0 }, fade: { value: 1 } },
			vertexShader: `uniform float time;
attribute float size;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 0.5);
  gl_PointSize = size * (30.0 / -mvPosition.z) * (3.0 + sin(time + 100.0));
  gl_Position = projectionMatrix * mvPosition;
}`,
			fragmentShader: `uniform sampler2D pointTexture;
uniform float fade;
varying vec3 vColor;
void main() {
  float opacity = 1.0;
  if (fade == 1.0) {
    float d = distance(gl_PointCoord, vec2(0.5, 0.5));
    opacity = 1.0 / (1.0 + exp(16.0 * (d - 0.25)));
  }
  gl_FragColor = vec4(vColor, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
		});
	}
}

function genStar(radius: number): THREE.Vector3 {
	return new THREE.Vector3().setFromSpherical(
		new THREE.Spherical(
			radius,
			Math.acos(1 - Math.random() * 2),
			Math.random() * 2 * Math.PI,
		),
	);
}

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Stars({
	radius = 100,
	depth = 50,
	count = 5000,
	saturation = 0,
	factor = 4,
	fade = false,
	speed = 1,
	ref,
}: StarsProps & { ref?: ThreeRef<THREE.Points> }) @{
	const [position, color, size] = useMemo(() => {
		const positions: number[] = [];
		const colors: number[] = [];
		const sizes = Array.from({ length: count }, () => (0.5 + 0.5 * Math.random()) * factor);
		const currentColor = new THREE.Color();
		let currentRadius = radius + depth;
		const increment = depth / count;
		for (let index = 0; index < count; index++) {
			currentRadius -= increment * Math.random();
			positions.push(...genStar(currentRadius).toArray());
			currentColor.setHSL(index / count, saturation, 0.9);
			colors.push(currentColor.r, currentColor.g, currentColor.b);
		}
		return [new Float32Array(positions), new Float32Array(colors), new Float32Array(sizes)];
	}, [count, depth, factor, radius, saturation]);
	const [material] = useState(() => new StarfieldMaterial());
	material.blending = THREE.AdditiveBlending;
	material.uniforms.fade.value = fade;
	material.depthWrite = false;
	material.transparent = true;
	material.vertexColors = true;
	useFrame((state) => (material.uniforms.time.value = state.clock.elapsedTime * speed));
	const mergedRef = useMemo(() => (value: THREE.Points | null) => assignRef(ref, value), [ref]);
	<points ref={mergedRef}>
		<bufferGeometry>
			<bufferAttribute attach="attributes-position" args={[position, 3]} />
			<bufferAttribute attach="attributes-color" args={[color, 3]} />
			<bufferAttribute attach="attributes-size" args={[size, 1]} />
		</bufferGeometry>
		<primitive object={material} attach="material" />
	</points>
}
