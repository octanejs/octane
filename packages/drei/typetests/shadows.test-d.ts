import {
	Shadow,
	ShadowAlpha,
	type ShadowAlphaProps,
	type ShadowProps,
	type ShadowType,
} from '../src/index.js';
import { Mesh, Texture } from 'three';

const props: ShadowProps = { color: '#000', opacity: 0.5, fog: false };
const alpha: ShadowAlphaProps = { opacity: 0.2, alphaMap: new Texture() };
const shadow: ShadowType = new Mesh() as ShadowType;
Shadow;
ShadowAlpha;
props;
alpha;
shadow.geometry.computeBoundingBox();

// @ts-expect-error opacity must be numeric
const invalidOpacity: ShadowProps = { opacity: 'half' };
// @ts-expect-error alphaMap must be a texture or false
const invalidAlpha: ShadowAlphaProps = { alphaMap: 'texture' };
