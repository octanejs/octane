// Pristine side: published Visx Shape.Pie typings via @visx/visx, compiled with plain tsc.
// Shared assertion groups match ../adapted/types.test-d.ts under packages/visx/audit/type-parity.json.
import { Shape } from '@visx/visx';

type ComponentProps<C> = C extends (props: infer P) => any ? P : never;
type PiePropsUnderTest = ComponentProps<typeof Shape.Pie>;
type ChildrenRender = NonNullable<PiePropsUnderTest['children']>;
type CentroidRender = NonNullable<PiePropsUnderTest['centroid']>;

declare function acceptChildrenReturn(value: ReturnType<ChildrenRender>): void;
declare function acceptCentroidReturn(value: ReturnType<CentroidRender>): void;
declare const octaneRenderable: unknown;

function consumerTypeFixtures() {
	// 1. Pie children render-prop return rejects an Octane renderable.
	// @ts-expect-error React Visx children returns are ReactNode and reject unknown.
	acceptChildrenReturn(octaneRenderable);

	// 2. Pie centroid return rejects an Octane renderable.
	// @ts-expect-error React Visx centroid returns are ReactNode and reject unknown.
	acceptCentroidReturn(octaneRenderable);
}

void consumerTypeFixtures;
