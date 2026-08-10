/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, type ThreeRef } from '@octanejs/three';
import { useLayoutEffect, useMemo, useRef, useState } from '@octanejs/three/renderer';
import { Box3, Group, type Object3D, Sphere, Vector3 } from 'three';

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export type OnCenterCallbackProps = {
	parent: Object3D;
	container: Object3D;
	width: number;
	height: number;
	depth: number;
	boundingBox: Box3;
	boundingSphere: Sphere;
	center: Vector3;
	verticalAlignment: number;
	horizontalAlignment: number;
	depthAlignment: number;
};

export type CenterProps =
	Omit<ThreeElements['group'], 'ref'> & {
		top?: boolean;
		right?: boolean;
		bottom?: boolean;
		left?: boolean;
		front?: boolean;
		back?: boolean;
		disable?: boolean;
		disableX?: boolean;
		disableY?: boolean;
		disableZ?: boolean;
		object?: Object3D | null;
		precise?: boolean;
		onCentered?: (props: OnCenterCallbackProps) => void;
		cacheKey?: any;
	};

export function Center({
	children,
	object,
	disable,
	disableX,
	disableY,
	disableZ,
	left,
	right,
	top,
	bottom,
	front,
	back,
	onCentered,
	precise = true,
	cacheKey = 0,
	ref,
	...props
}: CenterProps & { ref?: ThreeRef<Group> }) @{
	const container = useRef<Group | null>(null);
	const outer = useRef<Group | null>(null);
	const inner = useRef<Group | null>(null);
	const [box] = useState(() => new Box3());
	const [center] = useState(() => new Vector3());
	const [sphere] = useState(() => new Sphere());
	const mergedRef = useMemo(
		() => (value: Group | null) => {
			container.current = value;
			assignRef(ref, value);
		},
		[ref],
	);
	useLayoutEffect(() => {
		if (!outer.current || !inner.current || !container.current) return;
		outer.current.matrixWorld.identity();
		box.setFromObject(object ?? inner.current, precise);
		const width = box.max.x - box.min.x;
		const height = box.max.y - box.min.y;
		const depth = box.max.z - box.min.z;
		box.getCenter(center);
		box.getBoundingSphere(sphere);
		const verticalAlignment =
			top
				? height / 2
				: bottom
					? -height / 2
					: 0;
		const horizontalAlignment =
			left
				? -width / 2
				: right
					? width / 2
					: 0;
		const depthAlignment =
			front
				? depth / 2
				: back
					? -depth / 2
					: 0;
		outer.current.position.set(
			disable || disableX ? 0 : -center.x + horizontalAlignment,
			disable || disableY ? 0 : -center.y + verticalAlignment,
			disable || disableZ ? 0 : -center.z + depthAlignment,
		);
		onCentered?.({
			parent: container.current.parent!,
			container: container.current,
			width,
			height,
			depth,
			boundingBox: box,
			boundingSphere: sphere,
			center,
			verticalAlignment,
			horizontalAlignment,
			depthAlignment,
		});
	}, [
		cacheKey,
		onCentered,
		top,
		left,
		front,
		disable,
		disableX,
		disableY,
		disableZ,
		object,
		precise,
		right,
		bottom,
		back,
		box,
		center,
		sphere,
	]);
	<group ref={mergedRef} {...props}>
		<group ref={outer}>
			<group ref={inner}>{children}</group>
		</group>
	</group>
}
