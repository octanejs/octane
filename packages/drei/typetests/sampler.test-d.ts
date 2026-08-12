import type { SamplerProps, TransformFn, useSurfaceSamplerProps } from '@octanejs/drei';
import type { RefObject } from '@octanejs/three/renderer';
import * as THREE from 'three';

const mesh: RefObject<THREE.Mesh> = { current: new THREE.Mesh() };
const instances: RefObject<THREE.InstancedMesh> = {
	current: new THREE.InstancedMesh(undefined, undefined, 2),
};
const transform: TransformFn = ({ dummy, position, normal, color, sampledMesh }, index) => {
	dummy.position.copy(position).add(normal);
	void color;
	void sampledMesh;
	void index;
};
const props: SamplerProps = { mesh, instances, count: 2, weight: 'weight', transform };
const hookProps: useSurfaceSamplerProps = { count: 2, weight: 'weight', transform };
void props;
void hookProps;

// @ts-expect-error count must be numeric.
const wrongCount: SamplerProps = { count: '2' };
// @ts-expect-error transforms receive a structured payload, not a Vector3 directly.
const wrongTransform: TransformFn = (position: THREE.Vector3) => void position;
void wrongCount;
void wrongTransform;
