/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeElements, ThreeRef } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import * as THREE from 'three';
import { slotDefault } from './compiler-slot.js';
import { shaderMaterial } from './shaderMaterial.js';

export const DiscardMaterialImpl = shaderMaterial(
	{},
	'void main() { }',
	'void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); discard;  }',
);

export type MeshDiscardMaterialProps = Omit<ThreeElements['shaderMaterial'], 'ref'>;

export function MeshDiscardMaterial({ ref, ...props }: MeshDiscardMaterialProps & {
	ref?: ThreeRef<THREE.ShaderMaterial>;
}) @{
	const [material] = useState(() => new DiscardMaterialImpl());
	<primitive object={material} ref={ref as any} attach="material" {...props as any} />
}

const opaqueFragment =
	Number.parseInt(THREE.REVISION, 10) >= 154 ? 'opaque_fragment' : 'output_fragment';

export class PointMaterialImpl extends THREE.PointsMaterial {
	constructor(props?: THREE.PointsMaterialParameters | null) {
		super(props ?? undefined);
		this.onBeforeCompile = (shader, renderer) => {
			const { isWebGL2 } = renderer.capabilities;
			shader.fragmentShader = shader.fragmentShader.replace(
				`#include <${opaqueFragment}>`,
				`
        ${
					!isWebGL2
						? `#extension GL_OES_standard_derivatives : enable\n#include <${opaqueFragment}>`
						: `#include <${opaqueFragment}>`
				}
      vec2 cxy = 2.0 * gl_PointCoord - 1.0;
      float r = dot(cxy, cxy);
      float delta = fwidth(r);     
      float mask = 1.0 - smoothstep(1.0 - delta, 1.0 + delta, r);
      gl_FragColor = vec4(gl_FragColor.rgb, mask * gl_FragColor.a );
      #include <tonemapping_fragment>
      #include <${
					Number.parseInt(THREE.REVISION, 10) >= 154 ? 'colorspace_fragment' : 'encodings_fragment'
				}>
      `,
			);
		};
	}
}

export type PointMaterialProps = Omit<ThreeElements['pointsMaterial'], 'ref'>;

export function PointMaterial({ ref, ...props }: PointMaterialProps & {
	ref?: ThreeRef<PointMaterialImpl>;
}) @{
	const [material] = useState(() => new PointMaterialImpl(null));
	<primitive object={material} ref={ref as any} attach="material" {...props as any} />
}

function createScreenQuadGeometry() {
	const geometry = new THREE.BufferGeometry();
	const vertices = new Float32Array([-1, -1, 3, -1, -1, 3]);
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
	geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 2));
	return geometry;
}

export type ScreenQuadProps = Omit<ThreeElements['mesh'], 'ref' | 'args'>;

export function ScreenQuad({ children, ref, ...props }: ScreenQuadProps & {
	ref?: ThreeRef<THREE.Mesh>;
}) @{
	const geometry = useMemo(createScreenQuadGeometry, []);
	<mesh ref={ref as any} geometry={geometry} frustumCulled={false} {...props}>{children}</mesh>
}

export type MaskProps =
	Omit<ThreeElements['mesh'], 'ref' | 'id'> & {
		id: number;
		colorWrite?: boolean;
		depthWrite?: boolean;
	};

export function Mask({
	id = 1,
	colorWrite = false,
	depthWrite = false,
	ref,
	...props
}: MaskProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const localRef = useRef<THREE.Mesh | null>(null);
	const spread = useMemo(
		() => ({
			colorWrite,
			depthWrite,
			stencilWrite: true,
			stencilRef: id,
			stencilFunc: THREE.AlwaysStencilFunc,
			stencilFail: THREE.ReplaceStencilOp,
			stencilZFail: THREE.ReplaceStencilOp,
			stencilZPass: THREE.ReplaceStencilOp,
		}),
		[id, colorWrite, depthWrite],
	);
	useLayoutEffect(() => {
		if (localRef.current) Object.assign(localRef.current.material, spread);
	});
	<mesh ref={[localRef, ref ?? null]} renderOrder={-id} {...props} />
}

export function useMask(id: number, inverse = false) {
	inverse = slotDefault(inverse, false);
	return {
		stencilWrite: true,
		stencilRef: id,
		stencilFunc: inverse ? THREE.NotEqualStencilFunc : THREE.EqualStencilFunc,
		stencilFail: THREE.KeepStencilOp,
		stencilZFail: THREE.KeepStencilOp,
		stencilZPass: THREE.KeepStencilOp,
	};
}
