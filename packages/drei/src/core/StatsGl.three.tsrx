/** @jsxImportSource @octanejs/three/intrinsics */
import { addAfterEffect, type ThreeRef, useThree } from '@octanejs/three';
import { useEffect, useMemo } from '@octanejs/three/renderer';
import StatsImpl from 'stats-gl';

type StatsOptions = ConstructorParameters<typeof StatsImpl>[0];

export type StatsGlProps = Partial<StatsOptions> & {
	id?: string;
	clearStatsGlStyle?: boolean;
	showPanel?: number;
	className?: string;
	parent?: { current: HTMLElement | null };
	ref?: ThreeRef<HTMLDivElement>;
};

function assignRef<T>(ref: ThreeRef<T> | undefined, value: T | null): void {
	if (Array.isArray(ref)) for (const item of ref) assignRef(item, value);
	else if (typeof ref === 'function') ref(value);
	else if (ref && 'current' in ref) ref.current = value;
}

export function StatsGl({
	className,
	parent,
	id,
	clearStatsGlStyle,
	ref,
	...props
}: StatsGlProps) @{
	const gl = useThree((state) => state.gl);
	const stats = useMemo(() => {
		const value = new StatsImpl(props);
		value.init(gl as any);
		return value;
	}, [gl]);
	useEffect(() => {
		assignRef(ref, stats.domElement);
		return () => assignRef(ref, null);
	}, [ref, stats]);
	useEffect(() => {
		const node = (parent && parent.current) || document.body;
		node?.appendChild(stats.domElement);
		stats.domElement.querySelectorAll('canvas').forEach((canvas) => {
			canvas.style.removeProperty('position');
		});
		if (id) stats.domElement.id = id;
		if (clearStatsGlStyle) stats.domElement.removeAttribute('style');
		stats.domElement.removeAttribute('style');
		const classNames = (className ?? '').split(' ').filter((value) => value);
		if (classNames.length) stats.domElement.classList.add(...classNames);
		const end = addAfterEffect(() => stats.update());
		return () => {
			if (classNames.length) stats.domElement.classList.remove(...classNames);
			node?.removeChild(stats.domElement);
			end();
		};
	}, [parent, stats, className, id, clearStatsGlStyle]);
	null;
}
