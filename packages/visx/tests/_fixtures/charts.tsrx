import { scaleBand, scaleLinear } from '@octanejs/visx/scale';
import { AxisBottom, AxisLeft } from '@octanejs/visx/axis';
import { Bar, LinePath, SplitLinePath } from '@octanejs/visx/shape';
import { curveNatural } from '@octanejs/visx/curve';
import { GridRows } from '@octanejs/visx/grid';
import { Group } from '@octanejs/visx/group';
import { LinearGradient } from '@octanejs/visx/gradient';
import { ClipPath } from '@octanejs/visx/clip-path';
import { PatternLines } from '@octanejs/visx/pattern';
import { MarkerArrow } from '@octanejs/visx/marker';
import { GlyphCircle } from '@octanejs/visx/glyph';
import { Text } from '@octanejs/visx/text';
import { Annotation, CircleSubject, Connector, Label } from '@octanejs/visx/annotation';
import { ParentSize } from '@octanejs/visx/responsive';
import { Wordcloud } from '@octanejs/visx/wordcloud';
import { useTooltipInPortal } from '@octanejs/visx/tooltip';
import {
	Axis,
	BarSeries,
	Grid,
	LineSeries,
	XYChart,
} from '@octanejs/visx/xychart';

const data = [
	{ name: 'alpha', value: 4 },
	{ name: 'beta', value: 8 },
	{ name: 'gamma', value: 6 },
];
const xAccessor = (datum: (typeof data)[number]) => datum.name;
const yAccessor = (datum: (typeof data)[number]) => datum.value;

export function PrimitiveFamilies() {
	const x = scaleBand({ domain: data.map(xAccessor), range: [30, 250], padding: 0.2 });
	const y = scaleLinear({ domain: [0, 10], range: [150, 10] });

	return <svg id="primitive-families" width={300} height={210} aria-label="primitive chart">
		<LinearGradient id="fixture-gradient" from="#08f" to="#80f" />
		<ClipPath id="fixture-clip">
			<rect width={280} height={180} />
		</ClipPath>
		<PatternLines id="fixture-pattern" width={8} height={8} stroke="#bbb" />
		<MarkerArrow id="fixture-arrow" refX={6} />
		<Group left={10} top={10} clipPath="url(#fixture-clip)">
			<GridRows scale={y} width={250} />
			{data.map(
				(datum) =>
					<Bar
						key={datum.name}
						x={x(datum.name)}
						y={y(datum.value)}
						width={x.bandwidth()}
						height={150 - y(datum.value)}
						fill="url(#fixture-gradient)"
					/>,
			)}
			<LinePath
				data={data}
				x={(datum) => (x(datum.name) ?? 0) + x.bandwidth() / 2}
				y={(datum) => y(datum.value)}
				stroke="#222"
			/>
			<SplitLinePath
				className="visx-split-fixture"
				segments={[data.slice(0, 2), data.slice(2)]}
				styles={[{ stroke: '#1971c2' }, { stroke: '#e8590c' }]}
				x={(datum) => (x(datum.name) ?? 0) + x.bandwidth() / 2}
				y={(datum) => y(datum.value)}
				curve={curveNatural}
				segmentation="x"
				sampleRate={4}
			/>
			<GlyphCircle left={40} top={40} size={25} fill="url(#fixture-pattern)" />
			<AxisBottom top={150} scale={x} />
			<AxisLeft scale={y} />
			<Text x={125} y={190} width={120} textAnchor="middle">Deterministic SVG text</Text>
			<Annotation x={210} y={40} dx={24} dy={-20}>
				<Connector />
				<CircleSubject />
				<Label title="Peak" subtitle="eight" />
			</Annotation>
		</Group>
	</svg>;
}

export function XYChartFamilies() {
	return <XYChart
		accessibilityLabel="xy chart fixture"
		width={420}
		height={280}
		xScale={{ type: 'band', paddingInner: 0.2 }}
		yScale={{ type: 'linear', domain: [0, 10] }}
	>
		<Grid rows columns={false} />
		<Axis orientation="bottom" />
		<Axis orientation="left" />
		<BarSeries dataKey="bars" data={data} xAccessor={xAccessor} yAccessor={yAccessor} />
		<LineSeries dataKey="line" data={data} xAccessor={xAccessor} yAccessor={yAccessor} />
	</XYChart>;
}

function WrappedSeries() {
	return <>
		<BarSeries
			dataKey="wrapped-bars"
			data={data}
			xAccessor={xAccessor}
			yAccessor={yAccessor}
			colorAccessor={() => '#51cf66'}
		/>
		<LineSeries
			dataKey="wrapped-line"
			data={data}
			xAccessor={xAccessor}
			yAccessor={yAccessor}
			colorAccessor={() => '#e03131'}
		/>
	</>;
}

export function WrappedXYChartFamilies() {
	return <XYChart
		accessibilityLabel="wrapped xy chart fixture"
		width={420}
		height={280}
		xScale={{ type: 'band', domain: data.map(xAccessor), paddingInner: 0.2 }}
		yScale={{ type: 'linear', domain: [0, 10] }}
	>
		<WrappedSeries />
	</XYChart>;
}

export function ResponsiveFamilies() {
	return <ParentSize initialSize={{ width: 240, height: 120 }} data-testid="parent-size">
		{({ width, height }) => <svg width={width} height={height}>
			<rect width={width} height={height} fill="#def" />
		</svg>}
	</ParentSize>;
}

export function WordcloudFamilies() {
	return <Wordcloud
		width={320}
		height={180}
		words={[
			{ text: 'octane', value: 196 },
			{ text: 'visx', value: 144 },
			{ text: 'svg', value: 100 },
		]}
		rotate={0}
		fontSize={(word) => Math.sqrt(word.value)}
	>
		{(words) => words.map(
			(word) =>
				<text
					key={word.text}
					x={word.x}
					y={word.y}
					fontSize={word.size}
					transform={`rotate(${word.rotate ?? 0})`}
				>{word.text}</text>,
		)}
	</Wordcloud>;
}

export function TooltipSsrFallback() {
	const { TooltipInPortal } = useTooltipInPortal({ detectBounds: false });
	return <section id="tooltip-ssr-fallback">
		<span>Portal waits for the browser</span>
		<TooltipInPortal left={12} top={18}>client overlay</TooltipInPortal>
	</section>;
}

export function ServerFamilies() {
	return <main id="visx-server-fixture">
		<PrimitiveFamilies />
		<XYChartFamilies />
		<WrappedXYChartFamilies />
		<ResponsiveFamilies />
		<WordcloudFamilies />
		<TooltipSsrFallback />
	</main>;
}
