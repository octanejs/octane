import { memo } from 'octane';
import { getStraightPath } from '@xyflow/system';

import { BaseEdge } from './BaseEdge.tsrx';
import type { StraightEdgeProps } from '../../types';

function createStraightEdge(params: { isInternal: boolean }) {
	// eslint-disable-next-line react/display-name
	return memo(({
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		label,
		labelStyle,
		labelShowBg,
		labelBgStyle,
		labelBgPadding,
		labelBgBorderRadius,
		style,
		markerEnd,
		markerStart,
		interactionWidth,
	}: StraightEdgeProps) => {
		const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });

		const _id = params.isInternal ? undefined : id;

		return <BaseEdge
			id={_id}
			path={path}
			labelX={labelX}
			labelY={labelY}
			label={label}
			labelStyle={labelStyle}
			labelShowBg={labelShowBg}
			labelBgStyle={labelBgStyle}
			labelBgPadding={labelBgPadding}
			labelBgBorderRadius={labelBgBorderRadius}
			style={style}
			markerEnd={markerEnd}
			markerStart={markerStart}
			interactionWidth={interactionWidth}
		/>;
	});
}

/**
 * Component that can be used inside a custom edge to render a straight line.
 *
 * @public
 * @example
 *
 * ```tsx
 * import { StraightEdge } from '@xyflow/react';
 *
 * function CustomEdge({ sourceX, sourceY, targetX, targetY }) {
 *   return (
 *     <StraightEdge
 *       sourceX={sourceX}
 *       sourceY={sourceY}
 *       targetX={targetX}
 *       targetY={targetY}
 *     />
 *   );
 * }
 * ```
 */
const StraightEdge = createStraightEdge({ isInternal: false });

/**
 * @internal
 */
const StraightEdgeInternal = createStraightEdge({ isInternal: true });

(StraightEdge as typeof StraightEdge & { displayName?: string }).displayName = 'StraightEdge';
(StraightEdgeInternal as typeof StraightEdgeInternal & { displayName?: string }).displayName =
	'StraightEdgeInternal';

export { StraightEdge, StraightEdgeInternal };
