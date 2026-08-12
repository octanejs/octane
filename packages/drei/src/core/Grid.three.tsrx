/** @jsxImportSource @octanejs/three/intrinsics */
import { applyProps, type ThreeElements, type ThreeRef, useFrame } from '@octanejs/three';
import { useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { shaderMaterial } from './shaderMaterial.js';

export type GridMaterialType = {
	cellSize?: number;
	cellThickness?: number;
	cellColor?: THREE.ColorRepresentation;
	sectionSize?: number;
	sectionThickness?: number;
	sectionColor?: THREE.ColorRepresentation;
	followCamera?: boolean;
	infiniteGrid?: boolean;
	fadeDistance?: number;
	fadeStrength?: number;
	fadeFrom?: number;
	side?: THREE.Side;
};

export type GridProps =
	Omit<ThreeElements['mesh'], 'ref' | 'args'> & GridMaterialType & {
		args?: ConstructorParameters<typeof THREE.PlaneGeometry>;
	};

const GridMaterial = shaderMaterial(
	{
		cellSize: 0.5,
		sectionSize: 1,
		fadeDistance: 100,
		fadeStrength: 1,
		fadeFrom: 1,
		cellThickness: 0.5,
		sectionThickness: 1,
		cellColor: new THREE.Color(),
		sectionColor: new THREE.Color(),
		infiniteGrid: false,
		followCamera: false,
		worldCamProjPosition: new THREE.Vector3(),
		worldPlanePosition: new THREE.Vector3(),
	},
	`varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform vec3 worldPlanePosition;
    uniform float fadeDistance;
    uniform bool infiniteGrid;
    uniform bool followCamera;

    void main() {
      localPosition = position.xzy;
      if (infiniteGrid) localPosition *= 1.0 + fadeDistance;
      
      worldPosition = modelMatrix * vec4(localPosition, 1.0);
      if (followCamera) {
        worldPosition.xyz += (worldCamProjPosition - worldPlanePosition);
        localPosition = (inverse(modelMatrix) * worldPosition).xyz;
      }

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }`,
	`varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform float fadeDistance;
    uniform float fadeStrength;
    uniform float fadeFrom;
    uniform float cellThickness;
    uniform float sectionThickness;

    float getGrid(float size, float thickness) {
      vec2 r = localPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(grid.x, grid.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    void main() {
      float g1 = getGrid(cellSize, cellThickness);
      float g2 = getGrid(sectionSize, sectionThickness);

      vec3 from = worldCamProjPosition*vec3(fadeFrom);
      float dist = distance(from, worldPosition.xyz);
      float d = 1.0 - min(dist / fadeDistance, 1.0);
      vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));

      gl_FragColor = vec4(color, (g1 + g2) * pow(d, fadeStrength));
      gl_FragColor.a = mix(0.75 * gl_FragColor.a, gl_FragColor.a, g2);
      if (gl_FragColor.a <= 0.0) discard;

      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
);

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Grid({
	args,
	cellColor = '#000000',
	sectionColor = '#2080ff',
	cellSize = 0.5,
	sectionSize = 1,
	followCamera = false,
	infiniteGrid = false,
	fadeDistance = 100,
	fadeStrength = 1,
	fadeFrom = 1,
	cellThickness = 0.5,
	sectionThickness = 1,
	side = THREE.BackSide,
	ref,
	...props
}: GridProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const localRef = useRef<THREE.Mesh | null>(null);
	const mergedRef = useMemo(
		() => (value: THREE.Mesh | null) => {
			localRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	const [material] = useState(() => new GridMaterial());
	applyProps(material, {
		cellSize,
		sectionSize,
		cellColor,
		sectionColor,
		cellThickness,
		sectionThickness,
		fadeDistance,
		fadeStrength,
		fadeFrom,
		infiniteGrid,
		followCamera,
		side,
		transparent: true,
		extensions: { derivatives: true },
	});
	const plane = new THREE.Plane();
	const upVector = new THREE.Vector3(0, 1, 0);
	const zeroVector = new THREE.Vector3();
	useFrame((state) => {
		if (!localRef.current) return;
		plane.setFromNormalAndCoplanarPoint(upVector, zeroVector).applyMatrix4(
			localRef.current.matrixWorld,
		);
		const worldCamProjPosition = material.uniforms.worldCamProjPosition as THREE.Uniform<
			THREE.Vector3
		>;
		const worldPlanePosition = material.uniforms.worldPlanePosition as THREE.Uniform<THREE.Vector3>;
		plane.projectPoint(state.camera.position, worldCamProjPosition.value);
		worldPlanePosition.value.set(0, 0, 0).applyMatrix4(localRef.current.matrixWorld);
	});
	<mesh ref={mergedRef} frustumCulled={false} {...props}>
		<primitive object={material} attach="material" />
		<planeGeometry args={args} />
	</mesh>
}
