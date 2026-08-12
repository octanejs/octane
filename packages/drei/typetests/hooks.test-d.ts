import { useCamera, useIntersect } from '../src/index.js';
import type { RefObject } from '@octanejs/three';
import { PerspectiveCamera, type Intersection, type Mesh, type Raycaster } from 'three';

const camera = new PerspectiveCamera();
const ref: RefObject<PerspectiveCamera> = { current: camera };
const raycast = useCamera(camera, { near: 1 });
useCamera(ref);
const compatible: (raycaster: Raycaster, intersections: Intersection[]) => void = raycast;
const meshRef = useIntersect<Mesh>((visible) => visible.valueOf());
meshRef.current?.updateMatrixWorld();

// @ts-expect-error camera must be a Three camera or compatible ref
useCamera({ current: {} });
// @ts-expect-error callback receives visibility as a boolean
useIntersect<Mesh>((visible: string) => visible);
