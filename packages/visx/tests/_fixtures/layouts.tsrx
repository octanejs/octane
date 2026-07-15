import { hierarchy } from 'd3-hierarchy';
import { Chord } from '@octanejs/visx/chord';
import { Polygon as DelaunayPolygon } from '@octanejs/visx/delaunay';
import { Mercator } from '@octanejs/visx/geo';
import { HeatmapRect } from '@octanejs/visx/heatmap';
import { Tree } from '@octanejs/visx/hierarchy';
import { LegendOrdinal } from '@octanejs/visx/legend';
import { Graph } from '@octanejs/visx/network';
import { AnimatedAxis } from '@octanejs/visx/react-spring';
import { Sankey } from '@octanejs/visx/sankey';
import { scaleLinear, scaleOrdinal } from '@octanejs/visx/scale';
import { BoxPlot } from '@octanejs/visx/stats';
import { Threshold } from '@octanejs/visx/threshold';

const hierarchyRoot = hierarchy({
	name: 'root',
	children: [{ name: 'left' }, { name: 'right' }],
});
const graphNodes = [
	{ x: 20, y: 20 },
	{ x: 80, y: 50 },
];
const geoFeatures = [
	{
		type: 'Feature',
		properties: { name: 'square' },
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[-1, -1],
					[1, -1],
					[1, 1],
					[-1, 1],
					[-1, -1],
				],
			],
		},
	},
];

export function LayoutFamiliesFixture() {
	const ordinal = scaleOrdinal({ domain: ['alpha', 'beta'], range: ['#f03e3e', '#1971c2'] });
	const linear = scaleLinear({ domain: [0, 10], range: [100, 0] });
	return <section id="layout-families">
		<Chord matrix={[[1, 2], [3, 4]]}>
			{({ chords }) => <output id="chord-count">
				{chords.length as string}
			</output>}
		</Chord>
		<LegendOrdinal scale={ordinal} />
		<svg width={420} height={320}>
			<DelaunayPolygon polygon={[[0, 0], [20, 0], [10, 20]]} fill="#ffd43b" />
			<HeatmapRect
				data={[
					{
						bin: 0,
						bins: [
							{ bin: 0, count: 1 },
						],
					},
				]}
				xScale={() => 30}
				yScale={() => 40}
				binWidth={12}
				binHeight={14}
				gap={2}
			/>
			<Tree root={hierarchyRoot} size={[100, 120]}>
				{(data) => <text id="tree-count">
					{data.descendants().length as string}
				</text>}
			</Tree>
			<Graph
				top={80}
				graph={{
					nodes: graphNodes,
					links: [
						{ source: graphNodes[0], target: graphNodes[1] },
					],
				}}
			/>
			<Mercator data={geoFeatures} scale={30} translate={[180, 80]} className="geo-fixture" />
			<Sankey
				top={120}
				root={{
					nodes: [{ name: 'one' }, { name: 'two' }],
					links: [
						{ source: 0, target: 1, value: 4 },
					],
				}}
				nodeProps={{ fill: '#7048e8' }}
				linkProps={{ stroke: '#9775fa' }}
			/>
			<BoxPlot
				top={180}
				left={20}
				valueScale={linear}
				min={1}
				firstQuartile={3}
				median={5}
				thirdQuartile={7}
				max={9}
				outliers={[10]}
			/>
			<Threshold
				data={[
					{ x: 1, y0: 6, y1: 10 },
					{ x: 2, y0: 7, y1: 11 },
				]}
				x={(datum) => datum.x}
				y0={(datum) => datum.y0}
				y1={(datum) => datum.y1}
				clipAboveTo={0}
				clipBelowTo={100}
			/>
			<AnimatedAxis
				top={250}
				scale={scaleLinear({ domain: [0, 10], range: [20, 200] })}
				numTicks={3}
			/>
		</svg>
	</section>;
}
