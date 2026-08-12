/** @jsxImportSource @octanejs/three/intrinsics */
import { extend, type ThreeElements, type ThreeRef, useThree } from '@octanejs/three';
import { useImperativeHandle, useLayoutEffect, useRef } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import { universalComponent } from 'octane/universal';
import * as THREE from 'three';
import { shaderMaterial } from './shaderMaterial.js';
import { useTexture } from './Texture.three.tsrx';

type ImageSource = { texture: THREE.Texture; url?: never } | { texture?: never; url: string };

export type ImageProps = Omit<ThreeElements['mesh'], 'scale'> & {
	segments?: number;
	scale?: number | [number, number];
	color?: ThreeElements['meshBasicMaterial']['color'];
	zoom?: number;
	radius?: number;
	grayscale?: number;
	toneMapped?: boolean;
	transparent?: boolean;
	opacity?: number;
	side?: THREE.Side;
	children?: OctaneNode;
} & ImageSource;

const ImageMaterialImpl = shaderMaterial(
	{
		color: new THREE.Color('white'),
		scale: new THREE.Vector2(1, 1),
		imageBounds: new THREE.Vector2(1, 1),
		resolution: 1024,
		map: null,
		zoom: 1,
		radius: 0,
		grayscale: 0,
		opacity: 1,
	},
	`varying vec2 vUv;
   varying vec2 vPos;
   void main() {
     gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.);
     vUv = uv;
     vPos = position.xy;
   }`,
	`varying vec2 vUv;
   varying vec2 vPos;
   uniform vec2 scale;
   uniform vec2 imageBounds;
   uniform float resolution;
   uniform vec3 color;
   uniform sampler2D map;
   uniform float radius;
   uniform float zoom;
   uniform float grayscale;
   uniform float opacity;
   const vec3 luma = vec3(.299, 0.587, 0.114);
   vec4 toGrayscale(vec4 color, float intensity) { return vec4(mix(color.rgb, vec3(dot(color.rgb, luma)), intensity), color.a); }
   vec2 aspect(vec2 size) { return size / min(size.x, size.y); }
   float udRoundBox(vec2 p, vec2 b, float r) { return length(max(abs(p) - b + r, 0.0)) - r; }
   void main() {
     vec2 s = aspect(scale);
     vec2 i = aspect(imageBounds);
     float rs = s.x / s.y;
     float ri = i.x / i.y;
     vec2 nextSize = rs < ri ? vec2(i.x * s.y / i.y, s.y) : vec2(s.x, i.y * s.x / i.x);
     vec2 offset = (rs < ri ? vec2((nextSize.x - s.x) / 2.0, 0.0) : vec2(0.0, (nextSize.y - s.y) / 2.0)) / nextSize;
     vec2 uv = vUv * s / nextSize + offset;
     vec2 zUv = (uv - vec2(0.5)) / zoom + vec2(0.5);
     vec2 res = vec2(scale * resolution);
     vec2 halfRes = 0.5 * res;
     float b = udRoundBox(vUv.xy * res - halfRes, halfRes, resolution * radius);
     vec3 a = mix(vec3(1.0, 0.0, 0.0), vec3(0.0), smoothstep(0.0, 1.0, b));
     gl_FragColor = toGrayscale(texture2D(map, zUv) * vec4(color, opacity * a), grayscale);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
   }`,
);
const ImageMaterialElement = extend(ImageMaterialImpl);

type ImageBaseProps = Omit<ImageProps, 'url'> & { texture: THREE.Texture };

function ImageBase({
	children,
	color,
	segments = 1,
	scale = 1,
	zoom = 1,
	grayscale = 0,
	opacity = 1,
	radius = 0,
	texture,
	toneMapped,
	transparent,
	side,
	ref,
	...props
}: ImageBaseProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const mesh = useRef<THREE.Mesh | null>(null);
	const size = useThree((state) => state.size);
	const planeBounds: [number, number] = Array.isArray(scale) ? [scale[0], scale[1]] : [scale, scale];
	const image = texture.image as { width: number; height: number };
	const imageBounds: [number, number] = [image.width, image.height];
	const resolution = Math.max(size.width, size.height);
	useImperativeHandle((ref ?? null) as any, () => mesh.current!, []);
	useLayoutEffect(() => {
		const geometry = mesh.current?.geometry as THREE.BufferGeometry & { parameters?: { width?: number; height?: number } };
		const material = mesh.current?.material as THREE.ShaderMaterial & { scale: THREE.Vector2 };
		if (geometry?.parameters) material.scale.set(
			planeBounds[0] * (geometry.parameters.width ?? 1),
			planeBounds[1] * (geometry.parameters.height ?? 1),
		);
	}, [planeBounds[0], planeBounds[1]]);
	<mesh ref={mesh} scale={Array.isArray(scale) ? [...scale, 1] : scale} {...props}>
		<planeGeometry args={[1, 1, segments, segments]} />
		<ImageMaterialElement
			color={color}
			map={texture as any}
			zoom={zoom}
			grayscale={grayscale}
			opacity={opacity}
			scale={planeBounds}
			imageBounds={imageBounds}
			resolution={resolution}
			radius={radius}
			toneMapped={toneMapped}
			transparent={transparent}
			side={side}
		/>
		{children}
	</mesh>
}

function ImageWithUrl({ url, ...props }: ImageProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const texture = useTexture(url!, undefined) as THREE.Texture;
	<ImageBase {...props as any} texture={texture} />
}

function ImageWithTexture({ url: _url, ...props }: ImageProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	<ImageBase {...props as any} />
}

export function Image(props: ImageProps & { ref?: ThreeRef<THREE.Mesh> }) @{
	const component = props.url ? ImageWithUrl : props.texture ? ImageWithTexture : null;
	if (!component) throw new Error('<Image /> requires a url or texture');
	<>{universalComponent('three', component as any, props as unknown as Record<string, unknown>)}</>
}
