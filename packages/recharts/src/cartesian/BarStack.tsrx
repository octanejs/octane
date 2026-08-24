import type { ComponentType, OctaneNode } from '../util/OctaneTypes.ts';
import type { NormalizedStackId, StackId } from '../util/ChartUtils';
import type { Props as LayerProps } from '../container/Layer.tsrx';
import type { RectRadius } from '../shape/Rectangle.tsrx';

export type BarStackProps = {
	stackId?: StackId;
	radius?: RectRadius;
	children?: OctaneNode;
};
export type BarStackSettings = {
	stackId: NormalizedStackId;
	radius: RectRadius;
};
// Port of cartesian/BarStack.tsx — rounded-corner clipping for whole bar
// stacks: one clipPath per stack rectangle, referenced by the bars.
import { createContext, memo, useContext, useMemo } from 'octane';
import { getNormalizedStackId } from '../util/ChartUtils';
import { useUniqueId } from '../util/useUniqueId';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { useAppSelector } from '../state/hooks';
import { selectStackRects } from '../state/selectors/barStackSelectors';
import { useIsPanorama } from '../context/PanoramaContext.ts';
import { Layer } from '../container/Layer.tsrx';
import { Rectangle } from '../shape/Rectangle.tsrx';
import { propsAreEqual } from '../util/propsAreEqual';

const BarStackContext = createContext<BarStackSettings | undefined>(undefined);

/**
 * Resolves the stack ID for a Bar: explicit prop wins, then BarStack context.
 */
export function useStackId(childStackId: StackId | undefined) {
	const stackSettings = useContext(BarStackContext);
	if (stackSettings != null) {
		return stackSettings.stackId;
	}
	if (childStackId == null) {
		return undefined;
	}
	return getNormalizedStackId(childStackId);
}

export const defaultBarStackProps = {
	radius: 0,
} as const satisfies Partial<BarStackProps>;

const getClipPathId = (stackId: NormalizedStackId, index: number) => {
	return 'recharts-bar-stack-clip-path-' + stackId + '-' + index;
};

export function useBarStackClipPathUrl(index: number) {
	const barStackContext = useContext(BarStackContext);
	if (barStackContext == null) {
		return undefined;
	}
	const { stackId } = barStackContext;
	return 'url(#' + getClipPathId(stackId, index) + ')';
}

export function BarStackClipLayer(props: LayerProps & {
	index: number;
}) {
	const { index, ...rest } = props;
	const clipPathUrl = useBarStackClipPathUrl(index);
	return <Layer className="recharts-bar-stack-layer" clipPath={clipPathUrl} {...rest} />;
}

/**
 * Renders one clipPath per stack rectangle so the whole stack gets rounded
 * corners.
 */
function BarStackClipPath(props: {
	stackId: NormalizedStackId;
	radius: RectRadius;
}) {
	const { stackId, radius } = props;
	const isPanorama = useIsPanorama();
	const positions = useAppSelector((state) => selectStackRects(state, stackId, isPanorama));
	if (positions == null || positions.length === 0) {
		return null;
	}
	return <defs>{positions.map((pos, index) => {
		if (pos == null) {
			return null;
		}
		const clipPathId = getClipPathId(stackId, index);
		return <clipPath key={clipPathId} id={clipPathId}>
			<Rectangle
				isAnimationActive={false}
				isUpdateAnimationActive={false}
				x={pos.x}
				y={pos.y}
				width={pos.width}
				height={pos.height}
				radius={radius}
			/>
		</clipPath>;
	})}</defs>;
}

function BarStackImpl(props: BarStackProps) @{
	const resolvedStackId = useUniqueId('recharts-bar-stack', getNormalizedStackId(props.stackId));
	const { children, radius } = resolveDefaultProps(props, defaultBarStackProps);
	const context: BarStackSettings = useMemo(() => ({ stackId: resolvedStackId, radius }), [
		resolvedStackId,
		radius,
	]);
	<BarStackContext.Provider value={context}>
		<BarStackClipPath stackId={resolvedStackId} radius={radius} />
		{children}
	</BarStackContext.Provider>
}

/**
 * @provides BarStackContext
 * @since 3.6
 */
export const BarStack = memo(BarStackImpl, propsAreEqual);
