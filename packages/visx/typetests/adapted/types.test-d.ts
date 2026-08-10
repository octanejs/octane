// Adapted side: @octanejs/visx PieProps compiled with tsrx-tsc.
// Shared assertion groups match ../pristine/types.test-d.ts under packages/visx/audit/type-parity.json.
import type { PieProps } from '../../src/shape/shapes/Pie.tsrx';

type PiePropsUnderTest = PieProps<number>;
type ChildrenRender = NonNullable<PiePropsUnderTest['children']>;
type CentroidRender = NonNullable<PiePropsUnderTest['centroid']>;

declare function acceptChildrenReturn(value: ReturnType<ChildrenRender>): void;
declare function acceptCentroidReturn(value: ReturnType<CentroidRender>): void;
declare const octaneRenderable: unknown;

function consumerTypeFixtures() {
	// 1. Pie children render-prop return accepts an Octane renderable.
	acceptChildrenReturn(octaneRenderable);

	// 2. Pie centroid return accepts an Octane renderable.
	acceptCentroidReturn(octaneRenderable);
}

void consumerTypeFixtures;
