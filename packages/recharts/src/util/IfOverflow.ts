// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
export type IfOverflow = 'hidden' | 'visible' | 'discard' | 'extendDomain';

export interface Overflowable {
	/**
	 * Defines how to draw this component if it falls partly outside the canvas:
	 *
	 * - `discard`: the whole component will not be drawn at all
	 * - `hidden`: the component will be clipped to the chart plot area
	 * - `visible`: the component will be drawn completely
	 * - `extendDomain`: the domain of the overflown axis will be extended such that the whole component fits into the plot area
	 *
	 * @defaultValue discard
	 */
	ifOverflow?: IfOverflow;
}
