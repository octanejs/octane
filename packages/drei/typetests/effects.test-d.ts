import * as THREE from 'three';
import { Effects, type EffectsProps } from '../src/index.js';

const props: EffectsProps = {
	multisamping: 4,
	colorSpace: THREE.SRGBColorSpace,
	type: THREE.UnsignedByteType,
	renderIndex: 2,
	disableGamma: true,
	depthBuffer: false,
};
Effects;
props;

// @ts-expect-error multisampling count is numeric
const invalidSamples: EffectsProps = { multisamping: 'four' };
// @ts-expect-error render index is numeric
const invalidIndex: EffectsProps = { renderIndex: 'after' };
