// Port of chart/CategoricalChart.tsx — the wrapper-div + root-svg pairing
// (or, in compact/panorama mode, just the bare surface).
import { RootSurface } from '../container/RootSurface.tsrx';
import { RechartsWrapper } from './RechartsWrapper.tsrx';
import { ClipPathProvider } from '../container/ClipPathProvider.tsrx';
import { svgPropertiesNoEvents } from '../util/svgPropertiesNoEvents';
import { ReportChartSize } from '../context/chartLayoutContext.ts';

export function CategoricalChart(props) {
	const {
		width,
		height,
		responsive,
		children,
		className,
		style,
		compact,
		title,
		desc,
		ref,
		...others
	} = props;
	const attrs = svgPropertiesNoEvents(others);
	// "compact" is the Brush panorama mode (but it's public, so it can render
	// outside Brush too).
	if (compact) {
		return <>
			<ReportChartSize width={width} height={height} />
			<RootSurface otherAttributes={attrs} title={title} desc={desc}>{children}</RootSurface>
		</>;
	}
	return <RechartsWrapper
		className={className}
		style={style}
		width={width}
		height={height}
		responsive={responsive ?? false}
		onClick={props.onClick}
		onMouseLeave={props.onMouseLeave}
		onMouseEnter={props.onMouseEnter}
		onMouseMove={props.onMouseMove}
		onMouseDown={props.onMouseDown}
		onMouseUp={props.onMouseUp}
		onContextMenu={props.onContextMenu}
		onDoubleClick={props.onDoubleClick}
		onTouchStart={props.onTouchStart}
		onTouchMove={props.onTouchMove}
		onTouchEnd={props.onTouchEnd}
	>
		<RootSurface otherAttributes={attrs} title={title} desc={desc} ref={ref}>
			<ClipPathProvider>{children}</ClipPathProvider>
		</RootSurface>
	</RechartsWrapper>;
}
