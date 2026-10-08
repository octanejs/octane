import type { ThreeRef } from '@octanejs/three';
import type { JSX } from '@octanejs/three/intrinsics';
import type * as THREE from 'three';

// A keyed `@for` row places its key on the row's root, which may be a component.
const rowAttributes: JSX.IntrinsicAttributes = { key: 'row' };

// Composing an authored ref with a spread that carries none leaves an absent
// entry in the ref array; attachment skips it.
const composedRef: ThreeRef<THREE.Group> = [
	undefined,
	null,
	(group: THREE.Group | null) => void group,
	{ current: null },
];

// @ts-expect-error A ref array entry is still a ref.
const invalidRef: ThreeRef<THREE.Group> = ['group'];

void rowAttributes;
void composedRef;
void invalidRef;
