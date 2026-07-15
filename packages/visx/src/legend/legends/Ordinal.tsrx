import type { PickD3Scale } from '@octanejs/visx/scale';
import type { LegendProps } from './Legend/index.tsrx';
import Legend from './Legend/index.tsrx';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOrdinalScale = PickD3Scale<'ordinal', any, any>;

export type LegendOrdinalProps<Scale extends AnyOrdinalScale> = LegendProps<Scale>;

/** Ordinal scales map from strings to an Output type. */
export default function Ordinal<Scale extends AnyOrdinalScale>(props: LegendOrdinalProps<Scale>) {
	return <Legend {...props} />;
}
