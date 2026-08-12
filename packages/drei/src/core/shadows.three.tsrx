/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef, useFrame, useInstanceHandle } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef } from '@octanejs/three/renderer';
import {
	Color,
	DoubleSide,
	type Mesh,
	type MeshBasicMaterial,
	type MeshDepthMaterial,
	type MeshDistanceMaterial,
	type PlaneGeometry,
	RGBADepthPacking,
	type Texture,
} from 'three';

export type ShadowProps =
	Omit<ThreeElements['mesh'], 'ref'> & {
		colorStop?: number;
		fog?: boolean;
		color?: Color | number | string;
		opacity?: number;
		depthWrite?: boolean;
	};

export type ShadowType = Mesh<PlaneGeometry, MeshBasicMaterial>;

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function Shadow({
	fog = false,
	renderOrder,
	depthWrite = false,
	colorStop = 0,
	color = 'black',
	opacity = 0.5,
	ref,
	...props
}: ShadowProps & { ref?: ThreeRef<ShadowType> }) @{
	const canvas = useMemo(() => {
		const element = document.createElement('canvas');
		element.width = 128;
		element.height = 128;
		const context = element.getContext('2d') as CanvasRenderingContext2D;
		const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
		gradient.addColorStop(colorStop, new Color(color).getStyle());
		gradient.addColorStop(1, 'rgba(0,0,0,0)');
		context.fillStyle = gradient;
		context.fillRect(0, 0, 128, 128);
		return element;
	}, [color, colorStop]);
	const mergedRef = useMemo(() => (value: ShadowType | null) => assignRef(ref, value), [ref]);
	<mesh renderOrder={renderOrder} ref={mergedRef} rotation-x={-Math.PI / 2} {...props}>
		<planeGeometry />
		<meshBasicMaterial
			transparent
			opacity={opacity}
			fog={fog}
			depthWrite={depthWrite}
			side={DoubleSide}
		>
			<canvasTexture attach="map" args={[canvas]} />
		</meshBasicMaterial>
	</mesh>
}

export interface ShadowAlphaProps {
	opacity?: number;
	alphaMap?: Texture | boolean;
}

export function ShadowAlpha({ opacity, alphaMap }: ShadowAlphaProps) @{
	const depthMaterialRef = useRef<MeshDepthMaterial | null>(null);
	const distanceMaterialRef = useRef<MeshDistanceMaterial | null>(null);
	const depthInstance = useInstanceHandle(depthMaterialRef);
	const uShadowOpacity = useRef({ value: 1 });
	const uAlphaMap = useRef<{ value: Texture | null }>({ value: null });
	const uHasAlphaMap = useRef({ value: false });
	useLayoutEffect(() => {
		if (!depthMaterialRef.current || !distanceMaterialRef.current) return;
		depthMaterialRef.current.onBeforeCompile = distanceMaterialRef.current.onBeforeCompile = (
			shader,
		) => {
			const mainLineStart = shader.fragmentShader.indexOf('void main');
			let mainLine = '';
			let character: string | undefined;
			let index = mainLineStart;
			while (character !== '\n' && index < mainLineStart + 100) {
				character = shader.fragmentShader.charAt(index);
				mainLine += character;
				index++;
			}
			mainLine = mainLine.trim();
			shader.vertexShader = shader.vertexShader.replace(
				'void main() {',
				`
        varying vec2 custom_vUv;

        void main() {
          custom_vUv = uv;
          `,
			);
			shader.fragmentShader = shader.fragmentShader.replace(
				mainLine,
				`
          uniform float uShadowOpacity;
          uniform sampler2D uAlphaMap;
          uniform bool uHasAlphaMap;

          varying vec2 custom_vUv;
  
          float bayerDither2x2( vec2 v ) {
            return mod( 3.0 * v.y + 2.0 * v.x, 4.0 );
          }
    
          float bayerDither4x4( vec2 v ) {
            vec2 P1 = mod( v, 2.0 );
            vec2 P2 = mod( floor( 0.5  * v ), 2.0 );
            return 4.0 * bayerDither2x2( P1 ) + bayerDither2x2( P2 );
          }
  
          void main() {
            float alpha = 
              uHasAlphaMap ? 
                uShadowOpacity * texture2D(uAlphaMap, custom_vUv).x
              : uShadowOpacity;

            if( ( bayerDither4x4( floor( mod( gl_FragCoord.xy, 4.0 ) ) ) ) / 16.0 >= alpha ) discard;
            `,
			);
			shader.uniforms.uShadowOpacity = uShadowOpacity.current;
			shader.uniforms.uAlphaMap = uAlphaMap.current;
			shader.uniforms.uHasAlphaMap = uHasAlphaMap.current;
		};
	}, []);
	useFrame(() => {
		const parent = depthInstance.current?.parent?.object as
			| (Mesh & {
					material?: MeshBasicMaterial;
			  })
			| undefined;
		const parentMaterial = parent?.material;
		if (!parentMaterial) return;
		uShadowOpacity.current.value = opacity ?? parentMaterial.opacity;
		if (alphaMap === false) {
			uAlphaMap.current.value = null;
			uHasAlphaMap.current.value = false;
		} else {
			uAlphaMap.current.value = (alphaMap || parentMaterial.alphaMap) as Texture | null;
			uHasAlphaMap.current.value = Boolean(uAlphaMap.current.value);
		}
	});
	<>
		<meshDepthMaterial
			ref={depthMaterialRef}
			attach="customDepthMaterial"
			depthPacking={RGBADepthPacking}
		/>
		<meshDistanceMaterial ref={distanceMaterialRef} attach="customDistanceMaterial" />
	</>
}
