import {
	createInstances,
	type InstanceProps,
	type InstancedAttributeProps,
	type InstancesProps,
	type MergedProps,
	type PositionMesh,
} from '@octanejs/drei';
import type { ThreeRef } from '@octanejs/three';
import * as THREE from 'three';

const instances: InstancesProps = { limit: 100, range: 20, frames: 3 };
const instance: InstanceProps = { position: [1, 2, 3], color: 'red' };
const attribute: InstancedAttributeProps = { name: 'weight', defaultValue: 1, normalized: true };
const meshes = [new THREE.Mesh()];
const merged: MergedProps = { meshes, children: () => null };
const [BoundInstances, BoundInstance] = createInstances<{ weight?: number }>();
const ref: ThreeRef<PositionMesh & { weight?: number }> = { current: null };
void instances;
void instance;
void attribute;
void merged;
void BoundInstances;
void BoundInstance;
void ref;

// @ts-expect-error frames is numeric, not a boolean switch.
const wrongFrames: InstancesProps = { frames: true };
// @ts-expect-error a custom instanced attribute requires its source property name.
const missingName: InstancedAttributeProps = { defaultValue: 0 };
void wrongFrames;
void missingName;
