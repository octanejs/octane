// Port of container/Surface.tsx — the root <svg> element every chart renders
// into. Ref is a plain prop (octane model, no forwardRef).
import { clsx } from 'clsx';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';

export function Surface(props) {
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
