// Port of container/Layer.tsx — an SVG <g> group. Ref is a plain prop.
import { clsx } from 'clsx';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';

export function Layer(props) {
	const { children, className, ref, ...others } = props;
	const layerClass = clsx('recharts-layer', className);
	return <g className={layerClass} {...svgPropertiesAndEvents(others)} ref={ref}>{children}</g>;
}
