/** @jsxImportSource @octanejs/three/intrinsics */
import { type ThreeElements, useInstanceHandle } from '@octanejs/three';
import { useLayoutEffect, useRef, useState } from '@octanejs/three/renderer';
import { BufferAttribute, type BufferGeometry } from 'three';

export type ComputedAttributeProps =
	Omit<ThreeElements['bufferAttribute'], 'args'> & {
		compute: (geometry: BufferGeometry) => BufferAttribute;
		name: string;
	};

export function ComputedAttribute({ compute, name, ...props }: ComputedAttributeProps) @{
	const [bufferAttribute] = useState(() => new BufferAttribute(new Float32Array(0), 1));
	const primitive = useRef<BufferAttribute | null>(null);
	const instance = useInstanceHandle(primitive);
	useLayoutEffect(() => {
		if (primitive.current && instance.current?.parent?.object) {
			primitive.current.copy(compute(instance.current.parent.object as BufferGeometry));
		}
	}, [compute]);
	<primitive
		ref={primitive}
		object={bufferAttribute}
		attach={`attributes-${name}`}
		{...props as any}
	/>
}
