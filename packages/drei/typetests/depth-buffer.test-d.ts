import { useDepthBuffer } from '../src/index.js';
import type { DepthTexture } from 'three';

const defaults: DepthTexture | null = useDepthBuffer();
const configured: DepthTexture | null = useDepthBuffer({ size: 512, frames: 3 });
defaults;
configured;

// @ts-expect-error frame counts are numeric
useDepthBuffer({ frames: 'always' });
