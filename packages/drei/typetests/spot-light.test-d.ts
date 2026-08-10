import * as THREE from 'three';
import { SpotLight, SpotLightShadow, type SpotLightProps } from '../src/index.js';

const props: SpotLightProps = {
	depthBuffer: new THREE.DepthTexture(128, 128),
	attenuation: 5,
	anglePower: 7,
	radiusTop: 0.1,
	radiusBottom: 1.5,
	opacity: 0.8,
	color: '#336699',
	volumetric: true,
	debug: false,
	angle: 0.25,
	distance: 10,
	position: [1, 2, 3],
	castShadow: true,
};
SpotLight;
SpotLightShadow;
props;

// @ts-expect-error attenuation is numeric
const invalidAttenuation: SpotLightProps = { attenuation: 'soft' };
// @ts-expect-error volumetric is boolean
const invalidVolumetric: SpotLightProps = { volumetric: 'yes' };
// @ts-expect-error depthBuffer is a Three depth texture
const invalidDepth: SpotLightProps = { depthBuffer: new THREE.Texture() };
