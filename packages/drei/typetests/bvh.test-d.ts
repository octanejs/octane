import { Bvh, type BVHOptions, type BvhProps, useBVH } from '../src/index.js';
import type { RefObject } from '@octanejs/three';
import { Mesh } from 'three';
import { SAH } from 'three-mesh-bvh';

const options: BVHOptions = { strategy: SAH, maxDepth: 20, maxLeafTris: 4, indirect: true };
const props: BvhProps = { ...options, enabled: true, firstHitOnly: true, name: 'bvh' };
const mesh: RefObject<Mesh | undefined> = { current: new Mesh() };
useBVH(mesh, options);
Bvh;
props;

// @ts-expect-error max depth is numeric
const invalidDepth: BVHOptions = { maxDepth: 'deep' };
// @ts-expect-error enabled is boolean
const invalidEnabled: BvhProps = { enabled: 1 };
