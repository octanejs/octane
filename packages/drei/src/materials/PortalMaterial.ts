import * as THREE from 'three';
import { shaderMaterial } from '../core/shaderMaterial.js';

export const PortalMaterialImpl = shaderMaterial(
	{ blur: 0, map: null, sdf: null, blend: 0, size: 0, resolution: new THREE.Vector2() },
	`varying vec2 vUv;
	void main() {
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		vUv = uv;
	}`,
	`uniform sampler2D sdf;
	uniform sampler2D map;
	uniform float blur;
	uniform float size;
	uniform float time;
	uniform vec2 resolution;
	varying vec2 vUv;
	#include <packing>
	void main() {
		vec2 uv = gl_FragCoord.xy / resolution.xy;
		vec4 t = texture2D(map, uv);
		float k = blur;
		float d = texture2D(sdf, vUv).r/size;
		float alpha = 1.0 - smoothstep(0.0, 1.0, clamp(d/k + 1.0, 0.0, 1.0));
		gl_FragColor = vec4(t.rgb, blur == 0.0 ? t.a : t.a * alpha);
		#include <tonemapping_fragment>
		#include <colorspace_fragment>
	}`,
);

export type PortalMaterialInstance = InstanceType<typeof PortalMaterialImpl> & {
	blur: number;
	blend: number;
	size: number;
	resolution: THREE.Vector2;
	sdf: THREE.Texture | null;
	map: THREE.Texture | null;
};
