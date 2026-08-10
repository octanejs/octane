/** @jsxImportSource @octanejs/three/intrinsics */
import type { ThreeElements, ThreeRef } from '@octanejs/three';
import { useMemo } from '@octanejs/three/renderer';
import type { OctaneNode } from 'octane';
import * as THREE from 'three';
import { SkeletonUtils } from 'three-stdlib';
import { isOctaneElement } from './octane-element.js';

export type CloneProps =
	Omit<ThreeElements['group'], 'ref' | 'children'> & {
		object: THREE.Object3D | THREE.Object3D[];
		children?: OctaneNode;
		deep?: boolean | 'materialsOnly' | 'geometriesOnly';
		keys?: string[];
		inject?: ThreeElements['mesh'] | OctaneNode | ((object: THREE.Object3D) => OctaneNode);
		castShadow?: boolean;
		receiveShadow?: boolean;
		isChild?: boolean;
	};

interface CloneConfig {
	deep?: CloneProps['deep'];
	keys?: string[];
	inject?: CloneProps['inject'];
	castShadow?: boolean;
	receiveShadow?: boolean;
}

const defaultKeys = [
	'near',
	'far',
	'color',
	'distance',
	'decay',
	'penumbra',
	'angle',
	'intensity',
	'skeleton',
	'visible',
	'castShadow',
	'receiveShadow',
	'morphTargetDictionary',
	'morphTargetInfluences',
	'name',
	'geometry',
	'material',
	'position',
	'rotation',
	'scale',
	'up',
	'userData',
	'bindMode',
	'bindMatrix',
	'bindMatrixInverse',
	'skeleton',
];

function createSpread(child: THREE.Object3D, config: CloneConfig) {
	const keys = config.keys ?? defaultKeys;
	let spread: Record<string, any> = {};
	for (const key of keys) spread[key] = (child as any)[key];
	if (config.deep) {
		if (spread.geometry && config.deep !== 'materialsOnly') spread.geometry =
			spread.geometry.clone();
		if (spread.material && config.deep !== 'geometriesOnly') spread.material =
			spread.material.clone();
	}
	let injectChildren: OctaneNode;
	if (config.inject) {
		if (typeof config.inject === 'function') injectChildren = config.inject(child);
		else if (isOctaneElement(config.inject)) injectChildren = config.inject;
		else spread = { ...spread, ...config.inject };
	}
	if (child instanceof THREE.Mesh) {
		if (config.castShadow) spread.castShadow = true;
		if (config.receiveShadow) spread.receiveShadow = true;
	}
	return { spread, injectChildren };
}

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref !== undefined && 'current' in ref) ref.current = value;
}

interface CloneNodeProps extends CloneConfig {
	object: THREE.Object3D;
	children?: OctaneNode;
	ref?: ThreeRef<THREE.Object3D>;
	rootProps?: Record<string, unknown>;
}

function createShell(object: THREE.Object3D): THREE.Object3D {
	const Constructor = object.constructor as new () => THREE.Object3D;
	return new Constructor();
}

function CloneNode({ object, children, ref, rootProps, ...config }: CloneNodeProps) @{
	const shell = useMemo(() => createShell(object), [object]);
	const { spread, injectChildren } = useMemo(() => createSpread(object, config), [
		object,
		config.keys,
		config.deep,
		config.inject,
		config.castShadow,
		config.receiveShadow,
	]);
	const objectRef = useMemo(() => (value: THREE.Object3D | null) => assignRef(ref, value), [ref]);

	<primitive object={shell} {...spread} {...rootProps} ref={objectRef}>
		@for (const child of object.children; key child.uuid) {
			@if (child.type === 'Bone') {
				<primitive object={child} />
			} @else {
				<CloneNode object={child} {...config} />
			}
		}
		{children}
		{injectChildren}
	</primitive>
}

export function Clone({
	isChild = false,
	object,
	children,
	deep,
	castShadow,
	receiveShadow,
	inject,
	keys,
	ref,
	...props
}: CloneProps & { ref?: ThreeRef<THREE.Group> }) @{
	const resolvedObject = useMemo(() => {
		if (isChild || Array.isArray(object)) return object;
		let isSkinned = false;
		object.traverse((child) => {
			if ((child as THREE.SkinnedMesh).isSkinnedMesh) isSkinned = true;
		});
		return isSkinned
			? SkeletonUtils.clone(
					object as unknown as Parameters<typeof SkeletonUtils.clone>[0],
				) as unknown as THREE.Object3D
			: object;
	}, [object, isChild]);
	const config = { deep, castShadow, receiveShadow, inject, keys };
	const groupRef = useMemo(() => (value: THREE.Group | null) => assignRef(ref, value), [ref]);

	@if (Array.isArray(resolvedObject)) {
		<group {...props} ref={groupRef}>
			@for (const child of resolvedObject; key child.uuid) {
				<CloneNode object={child} {...config} />
			}
			{children}
		</group>
	} @else {
		<CloneNode
			object={resolvedObject}
			children={children}
			ref={ref as ThreeRef<THREE.Object3D> | undefined}
			rootProps={props}
			{...config}
		/>
	}
}
