// Port of component/Cell.tsx — the null-rendering per-datum props carrier.
// Upstream reads Cells out of `children` via findAllByType; octane children
// are opaque compiled blocks, so the octane Cell REGISTERS its props into the
// ambient CellsContext instead (provided by Bar/Pie/…), preserving mount
// order == data-index order. Rendering output is identical: nothing.
/**
 * Cell component used to define colors and styles of chart elements.
 *
 * This component is now deprecated and will be removed in Recharts 4.0.
 * Please use the `shape` or `content` prop on the chart components instead.
 *
 * @deprecated
 * @consumes CellReader
 */
import { useLayoutEffect, useRef } from 'octane';
import { useCellsRegistry } from '../context/CellsContext';
import type { SVGProps, SVGPropsForHost } from '../util/OctaneTypes';

type CellGeometry = {
	x?: number;
	y?: number;
	cx?: number;
	cy?: number;
	width?: number;
	height?: number;
	radius?: number;
};

// Cell geometry feeds calculated chart paths, whose coordinates are numeric.
export type Props = Omit<SVGProps<SVGElement>, keyof CellGeometry> & CellGeometry;

// A shape writes its narrower host into the Cell's broader SVG ref sink.
// This write-only view is used at the renderer boundary; refs are never dropped.
export type CellPropsFor<T extends SVGElement> = SVGPropsForHost<Props, T>;

export function Cell(props: Props): null {
	const registry = useCellsRegistry();
	const token = useRef({});
	useLayoutEffect(() => {
		if (registry == null) {
			return;
		}
		registry.register(token.current, props);
	}, [registry, props]);
	useLayoutEffect(() => {
		return () => {
			if (registry != null) {
				registry.unregister(token.current);
			}
		};
	}, [registry]);
	return null;
}

Cell.displayName = 'Cell';
