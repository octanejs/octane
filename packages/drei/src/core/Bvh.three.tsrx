/** @jsxImportSource @octanejs/three/intrinsics */
import { type RefObject, type ThreeElements, type ThreeRef, useThree } from '@octanejs/three';
import { useEffect, useMemo, useRef } from '@octanejs/three/renderer';
import { Group, Mesh } from 'three';
import {
	acceleratedRaycast,
	computeBoundsTree,
	disposeBoundsTree,
	SAH,
	type SplitStrategy,
} from 'three-mesh-bvh';
import { slotDefault } from './compiler-slot.js';

const acceleratedRaycastCompat = acceleratedRaycast as unknown as Mesh['raycast'];
const computeBoundsTreeCompat = computeBoundsTree as any;
const disposeBoundsTreeCompat = disposeBoundsTree as any;

export interface BVHOptions {
	strategy?: SplitStrategy;
	verbose?: boolean;
	setBoundingBox?: boolean;
	maxDepth?: number;
	maxLeafTris?: number;
	indirect?: boolean;
}

export type BvhProps =
	BVHOptions & ThreeElements['group'] & {
		enabled?: boolean;
		firstHitOnly?: boolean;
	};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function useBVH(mesh: RefObject<Mesh | undefined>, options?: BVHOptions) {
	options = slotDefault(options, undefined);
	const resolved = {
		strategy: SAH,
		verbose: false,
		setBoundingBox: true,
		maxDepth: 40,
		maxLeafTris: 10,
		indirect: false,
		...options,
	};
	useEffect(() => {
		if (mesh.current) {
			mesh.current.raycast = acceleratedRaycastCompat;
			const geometry = mesh.current.geometry as any;
			geometry.computeBoundsTree = computeBoundsTreeCompat;
			geometry.disposeBoundsTree = disposeBoundsTreeCompat;
			geometry.computeBoundsTree(resolved);
			return () => {
				if (geometry.boundsTree) geometry.disposeBoundsTree();
			};
		}
	}, [mesh, JSON.stringify(resolved)]);
}

export function Bvh({
	enabled = true,
	firstHitOnly = false,
	children,
	strategy = SAH,
	verbose = false,
	setBoundingBox = true,
	maxDepth = 40,
	maxLeafTris = 10,
	indirect = false,
	ref,
	...props
}: BvhProps & { ref?: ThreeRef<Group> }) @{
	const localRef = useRef<Group | null>(null);
	const raycaster = useThree((state) => state.raycaster);
	const mergedRef = useMemo(
		() => (value: Group | null) => {
			localRef.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useEffect(() => {
		if (enabled && localRef.current) {
			const options = { strategy, verbose, setBoundingBox, maxDepth, maxLeafTris, indirect };
			const group = localRef.current;
			const acceleratedMeshes: Mesh[] = [];
			const bvhRaycaster = raycaster as typeof raycaster & { firstHitOnly?: boolean };
			bvhRaycaster.firstHitOnly = firstHitOnly;
			group.traverse((child) => {
				if (
					child instanceof Mesh && !child.geometry.boundsTree &&
						child.raycast === Mesh.prototype.raycast
				) {
					acceleratedMeshes.push(child);
					child.raycast = acceleratedRaycastCompat;
					child.geometry.computeBoundsTree = computeBoundsTreeCompat;
					child.geometry.disposeBoundsTree = disposeBoundsTreeCompat;
					child.geometry.computeBoundsTree(options);
				}
			});
			return () => {
				delete bvhRaycaster.firstHitOnly;
				for (const child of acceleratedMeshes) {
					const geometry = child.geometry as any;
					if (geometry.boundsTree) geometry.disposeBoundsTree();
					child.raycast = Mesh.prototype.raycast;
				}
			};
		}
	}, []);
	<group ref={mergedRef} {...props}>{children}</group>
}
