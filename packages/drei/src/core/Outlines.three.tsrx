/** @jsxImportSource @octanejs/three/intrinsics */
import { applyProps, type ThreeElements, useThree } from '@octanejs/three';
import { useEffect, useLayoutEffect, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { toCreasedNormals } from 'three-stdlib';
import { shaderMaterial } from './shaderMaterial.js';

const OutlinesMaterial = shaderMaterial(
	{
		screenspace: false,
		color: new THREE.Color('black'),
		opacity: 1,
		thickness: 0.05,
		size: new THREE.Vector2(),
	},
	`#include <common>
   #include <morphtarget_pars_vertex>
   #include <skinning_pars_vertex>
   #include <clipping_planes_pars_vertex>
   uniform float thickness;
   uniform bool screenspace;
   uniform vec2 size;
   void main() {
     #if defined (USE_SKINNING)
	     #include <beginnormal_vertex>
       #include <morphnormal_vertex>
       #include <skinbase_vertex>
       #include <skinnormal_vertex>
       #include <defaultnormal_vertex>
     #endif
     #include <begin_vertex>
	   #include <morphtarget_vertex>
	   #include <skinning_vertex>
     #include <project_vertex>
     #include <clipping_planes_vertex>
     vec4 tNormal = vec4(normal, 0.0);
     vec4 tPosition = vec4(transformed, 1.0);
     #ifdef USE_INSTANCING
       tNormal = instanceMatrix * tNormal;
       tPosition = instanceMatrix * tPosition;
     #endif
     if (screenspace) {
       vec3 newPosition = tPosition.xyz + tNormal.xyz * thickness;
       gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
     } else {
       vec4 clipPosition = projectionMatrix * modelViewMatrix * tPosition;
       vec4 clipNormal = projectionMatrix * modelViewMatrix * tNormal;
       vec2 offset = normalize(clipNormal.xy) * thickness / size * clipPosition.w * 2.0;
       clipPosition.xy += offset;
       gl_Position = clipPosition;
     }
   }`,
	`uniform vec3 color;
   uniform float opacity;
   #include <clipping_planes_pars_fragment>
   void main(){
     #include <clipping_planes_fragment>
     gl_FragColor = vec4(color, opacity);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
   }`,
);

export type OutlinesProps = Omit<ThreeElements['group'], 'ref'> & {
	color?: ThreeElements['meshBasicMaterial']['color'];
	screenspace?: boolean;
	opacity?: number;
	transparent?: boolean;
	thickness?: number;
	angle?: number;
	clippingPlanes?: THREE.Plane[];
	toneMapped?: boolean;
	polygonOffset?: boolean;
	polygonOffsetFactor?: number;
	renderOrder?: number;
};

export function Outlines({
	color = 'black',
	opacity = 1,
	transparent = false,
	screenspace = false,
	toneMapped = true,
	polygonOffset = false,
	polygonOffsetFactor = 0,
	renderOrder = 0,
	thickness = 0.05,
	angle = Math.PI,
	clippingPlanes,
	...props
}: OutlinesProps) @{
	const groupRef = useRef<THREE.Group | null>(null);
	const [material] = useState(() => new OutlinesMaterial({ side: THREE.BackSide }));
	const gl = useThree((state) => state.gl);
	const size = useThree((state) => state.size);
	const contextSize = typeof (gl as any).getDrawingBufferSize === 'function'
		? (gl as any).getDrawingBufferSize(new THREE.Vector2())
		: new THREE.Vector2(size.width, size.height);
	const oldAngle = useRef(0);
	const oldGeometry = useRef<THREE.BufferGeometry | null>(null);
	useLayoutEffect(() => {
		const group = groupRef.current;
		if (!group) return;
		const parent = group.parent as THREE.Mesh & THREE.SkinnedMesh & THREE.InstancedMesh;
		if (!parent?.geometry || (oldAngle.current === angle && oldGeometry.current === parent.geometry)) return;
		oldAngle.current = angle;
		oldGeometry.current = parent.geometry;
		let mesh = group.children[0] as any;
		if (mesh) {
			if (angle) mesh.geometry.dispose();
			group.remove(mesh);
		}
		if (parent.skeleton) {
			mesh = new THREE.SkinnedMesh();
			mesh.material = material;
			mesh.bind(parent.skeleton, parent.bindMatrix);
		} else if (parent.isInstancedMesh) {
			mesh = new THREE.InstancedMesh(parent.geometry, material, parent.count);
			mesh.instanceMatrix = parent.instanceMatrix;
		} else {
			mesh = new THREE.Mesh();
			mesh.material = material;
		}
		group.add(mesh);
		mesh.geometry = angle ? toCreasedNormals(parent.geometry as any, angle) as any : parent.geometry;
		mesh.morphTargetInfluences = parent.morphTargetInfluences;
		mesh.morphTargetDictionary = parent.morphTargetDictionary;
	});
	useLayoutEffect(() => {
		const group = groupRef.current;
		const mesh = group?.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.Material> | undefined;
		if (!group || !mesh) return;
		mesh.renderOrder = renderOrder;
		const parent = group.parent as THREE.Mesh;
		applyProps(mesh as any, {
			morphTargetInfluences: parent.morphTargetInfluences,
			morphTargetDictionary: parent.morphTargetDictionary,
		});
		applyProps(mesh.material as any, {
			transparent,
			thickness,
			color,
			opacity,
			size: contextSize,
			screenspace,
			toneMapped,
			polygonOffset,
			polygonOffsetFactor,
			clippingPlanes,
			clipping: Boolean(clippingPlanes?.length),
		});
	});
	useEffect(() => () => {
		const group = groupRef.current;
		const mesh = group?.children[0] as THREE.Mesh | undefined;
		if (group && mesh) {
			if (angle) mesh.geometry.dispose();
			group.remove(mesh);
		}
	}, []);
	<group ref={groupRef} {...props} />
}
