import type { CSSProperties, OctaneNode, SVGProps } from '../util/OctaneTypes.ts';
import type { CartesianViewBox } from '../util/types';

interface SurfaceProps {
	width: number | string;
	height: number | string;
	viewBox?: CartesianViewBox;
	className?: string;
	style?: CSSProperties;
	children?: OctaneNode;
	title?: string;
	desc?: string;
}
export type Props = Omit<SVGProps<SVGSVGElement>, 'viewBox'> & SurfaceProps;
// Port of container/Surface.tsx — the root <svg> element every chart renders
// into. Ref is a plain prop (octane model, no forwardRef).
import { clsx } from 'clsx';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';

export function Surface(props: Props) {
	const { children, width, height, viewBox, className, style, title, desc, ref, ...others } = props;
	const svgView = viewBox || { width, height, x: 0, y: 0 };
	const layerClass = clsx('recharts-surface', className);
	return <svg
		{...svgPropertiesAndEvents(others)}
		className={layerClass}
		width={width}
		height={height}
		style={style}
		viewBox={svgView.x + ' ' + svgView.y + ' ' + svgView.width + ' ' + svgView.height}
		ref={ref}
	>
		<title>{title}</title>
		<desc>{desc}</desc>
		{children}
	</svg>;
}
