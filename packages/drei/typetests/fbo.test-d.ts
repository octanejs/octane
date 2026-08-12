import { Fbo, useFBO, type FboProps } from '../src/index.js';
import type { WebGLRenderTarget } from 'three';

const target: WebGLRenderTarget = useFBO(256, 128, { samples: 4, depthBuffer: true });
const automatic: WebGLRenderTarget = useFBO({ type: 1016, depth: true });
const props: FboProps = { width: 64, height: 32, samples: 2, children: (value) => value };
Fbo;
target;
automatic;
props;

// @ts-expect-error height is measured in pixels
const invalid: FboProps = { height: 'full' };
