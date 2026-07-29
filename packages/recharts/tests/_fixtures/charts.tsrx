import {
	Area,
	AreaChart,
	BarChart,
	LineChart,
	Bar,
	Cell,
	CartesianGrid,
	ComposedChart,
	DefaultLegendContent,
	DefaultTooltipContent,
	ErrorBar,
	Funnel,
	FunnelChart,
	Line,
	Legend,
	Pie,
	PieChart,
	PolarAngleAxis,
	PolarGrid,
	PolarRadiusAxis,
	Radar,
	RadarChart,
	RadialBar,
	RadialBarChart,
	ReferenceLine,
	ResponsiveContainer,
	Scatter,
	ScatterChart,
	Sankey,
	SunburstChart,
	Tooltip,
	XAxis,
	YAxis,
	ZAxis,
} from '@octanejs/recharts';

void DefaultLegendContent;
void DefaultTooltipContent;

// Phase 1 differential fixture: static BarChart + LineChart with axes
// (isAnimationActive={false} — the animated path is Phase 5).

const data = [
	{ name: 'Page A', uv: 400, pv: 240 },
	{ name: 'Page B', uv: 300, pv: 456 },
	{ name: 'Page C', uv: 300, pv: 139 },
	{ name: 'Page D', uv: 200, pv: 980 },
	{ name: 'Page E', uv: 278, pv: 390 },
	{ name: 'Page F', uv: 189, pv: 480 },
];

export function BarChartApp() @{
	<BarChart width={500} height={300} data={data}>
		<XAxis dataKey="name" />
		<YAxis />
		<Bar dataKey="uv" fill="#8884d8" isAnimationActive={false} />
		<Bar dataKey="pv" fill="#82ca9d" isAnimationActive={false} />
	</BarChart>
}

export function LineChartApp() @{
	<LineChart width={500} height={300} data={data}>
		<XAxis dataKey="name" />
		<YAxis />
		<Line type="monotone" dataKey="uv" stroke="#8884d8" isAnimationActive={false} />
		<Line
			type="linear"
			dataKey="pv"
			stroke="#82ca9d"
			strokeDasharray="5 5"
			isAnimationActive={false}
		/>
	</LineChart>
}

export function ResponsiveChartApp() @{
	<ResponsiveContainer width={420} height={240}>
		<LineChart data={data}>
			<XAxis dataKey="name" />
			<YAxis />
			<Line dataKey="uv" isAnimationActive={false} />
		</LineChart>
	</ResponsiveContainer>
}

export function OverlayChartApp() @{
	<BarChart width={500} height={300} data={data}>
		<XAxis dataKey="name" />
		<YAxis />
		<Tooltip active defaultIndex={0} isAnimationActive={false} />
		<Legend />
		<Bar dataKey="uv" name="UV" fill="#8884d8" isAnimationActive={false} />
	</BarChart>
}

export function CartesianChartsApp() @{
	<div>
		<AreaChart width={500} height={300} data={data}>
			<CartesianGrid />
			<XAxis dataKey="name" />
			<YAxis />
			<ReferenceLine y={400} />
			<Area dataKey="uv" fill="#8884d8" stroke="#8884d8" isAnimationActive={false} />
		</AreaChart>
		<ComposedChart width={500} height={300} data={data}>
			<XAxis dataKey="name" />
			<YAxis />
			<Area dataKey="pv" fill="#82ca9d" stroke="#82ca9d" isAnimationActive={false} />
			<Line dataKey="uv" isAnimationActive={false} />
		</ComposedChart>
		<ScatterChart width={500} height={300}>
			<XAxis dataKey="x" type="number" />
			<YAxis dataKey="y" type="number" />
			<ZAxis dataKey="z" />
			<Scatter
				data={[
					{ x: 10, y: 20, z: 100 },
					{ x: 30, y: 40, z: 200 },
				]}
				fill="#8884d8"
				isAnimationActive={false}
			/>
		</ScatterChart>
		<FunnelChart width={500} height={300}>
			<Funnel
				dataKey="value"
				data={[
					{ name: 'A', value: 100 },
					{ name: 'B', value: 60 },
				]}
				isAnimationActive={false}
			/>
		</FunnelChart>
	</div>
}

const scatterCellData = [
	{ x: 10, y: 20 },
	{ x: 30, y: 40 },
];

export function ScatterCellsApp() @{
	<ScatterChart width={500} height={300}>
		<XAxis dataKey="x" type="number" />
		<YAxis dataKey="y" type="number" />
		<Scatter data={scatterCellData} fill="#8884d8" isAnimationActive={false}>
			<Cell fill="#ff0000" />
			<Cell fill="#0000ff" />
		</Scatter>
	</ScatterChart>
}

export function HiddenScatterCellsApp({ hide }) @{
	<ScatterChart width={500} height={300}>
		<XAxis dataKey="x" type="number" />
		<YAxis dataKey="y" type="number" />
		<Scatter data={scatterCellData} fill="#8884d8" hide={hide} isAnimationActive={false}>
			<Cell fill="#ff0000" />
			<Cell fill="#0000ff" />
		</Scatter>
	</ScatterChart>
}

const zeroErrorBarData = [
	{ name: 'A', value: 50, error: 0 },
];

export function ZeroErrorBarApp() @{
	<BarChart width={400} height={300} data={zeroErrorBarData}>
		<XAxis dataKey="name" />
		<YAxis domain={[0, 100]} />
		<Bar dataKey="value" isAnimationActive={false}>
			<ErrorBar dataKey="error" isAnimationActive={false} />
		</Bar>
	</BarChart>
}

const animatedErrorBarData = [
	{ name: 'A', value: 50, error: 10 },
];

export function ErrorBarAnimationOriginApp() @{
	<BarChart width={400} height={300} data={animatedErrorBarData}>
		<XAxis dataKey="name" />
		<YAxis domain={[0, 100]} />
		<Bar dataKey="value" isAnimationActive={false}>
			<ErrorBar dataKey="error" isAnimationActive animationBegin={0} animationDuration={1} />
		</Bar>
	</BarChart>
}

export function FunnelLegendApp({ legendType, hide }) @{
	<FunnelChart width={500} height={300}>
		<Legend />
		<Funnel
			dataKey="value"
			data={[
				{ name: 'Visitors', value: 100 },
				{ name: 'Customers', value: 60 },
			]}
			isAnimationActive={false}
			legendType={legendType}
			hide={hide}
		>
			<Cell fill="#ff0000" />
			<Cell fill="#0000ff" />
		</Funnel>
	</FunnelChart>
}

const funnelAnimationData = [
	{ name: 'Visitors', value: 100 },
	{ name: 'Customers', value: 60 },
];

export function FunnelAnimationStabilityApp({ fill, onAnimationStart, onAnimationEnd }) @{
	<FunnelChart width={500} height={300}>
		<Funnel
			dataKey="value"
			data={funnelAnimationData}
			fill={fill}
			animationBegin={0}
			animationDuration={1}
			onAnimationStart={onAnimationStart}
			onAnimationEnd={onAnimationEnd}
		/>
	</FunnelChart>
}

const scatterAnimationData = [
	{ x: 10, y: 20 },
];

export function ScatterAnimationCallbacksApp({ onAnimationStart, onAnimationEnd }) @{
	<ScatterChart width={500} height={300}>
		<XAxis dataKey="x" type="number" />
		<YAxis dataKey="y" type="number" />
		<Scatter
			data={scatterAnimationData}
			animationDuration={1}
			onAnimationStart={onAnimationStart}
			onAnimationEnd={onAnimationEnd}
		/>
	</ScatterChart>
}

export function PolarChartsApp() @{
	<div>
		<PieChart width={400} height={300}>
			<Pie
				dataKey="value"
				data={[
					{ name: 'A', value: 100 },
					{ name: 'B', value: 60 },
				]}
				isAnimationActive={false}
			/>
		</PieChart>
		<RadarChart
			width={400}
			height={300}
			data={[
				{ subject: 'A', value: 80 },
				{ subject: 'B', value: 60 },
				{ subject: 'C', value: 90 },
			]}
		>
			<PolarGrid />
			<PolarAngleAxis dataKey="subject" />
			<PolarRadiusAxis />
			<Radar dataKey="value" fill="#8884d8" stroke="#8884d8" isAnimationActive={false} />
		</RadarChart>
		<RadialBarChart
			width={400}
			height={300}
			data={[
				{ name: 'A', value: 80 },
				{ name: 'B', value: 60 },
			]}
		>
			<PolarAngleAxis type="number" domain={[0, 100]} />
			<RadialBar dataKey="value" fill="#82ca9d" isAnimationActive={false} />
		</RadialBarChart>
	</div>
}

export function PolarCellsApp() @{
	<div>
		<PieChart width={400} height={300}>
			<Pie
				dataKey="value"
				data={[
					{ name: 'A', value: 100 },
					{ name: 'B', value: 60 },
				]}
				fill="#8884d8"
				isAnimationActive={false}
			>
				<Cell fill="#ff0000" />
				<Cell fill="#0000ff" />
			</Pie>
		</PieChart>
		<RadialBarChart
			width={400}
			height={300}
			data={[
				{ name: 'A', value: 80 },
				{ name: 'B', value: 60 },
			]}
		>
			<PolarAngleAxis type="number" domain={[0, 100]} />
			<RadialBar dataKey="value" fill="#82ca9d" isAnimationActive={false}>
				<Cell fill="#ff0000" />
				<Cell fill="#0000ff" />
			</RadialBar>
		</RadialBarChart>
	</div>
}

const pieAnimationData = [
	{ name: 'A', value: 100 },
	{ name: 'B', value: 60 },
];
const changedPieAnimationData = [
	{ name: 'A', value: 110 },
	{ name: 'B', value: 50 },
];
const radarAnimationData = [
	{ subject: 'A', value: 80 },
	{ subject: 'B', value: 60 },
	{ subject: 'C', value: 90 },
];
const changedRadarAnimationData = [
	{ subject: 'A', value: 90 },
	{ subject: 'B', value: 50 },
	{ subject: 'C', value: 70 },
];
const radialBarAnimationData = [
	{ name: 'A', value: 80 },
	{ name: 'B', value: 60 },
];
const changedRadialBarAnimationData = [
	{ name: 'A', value: 70 },
	{ name: 'B', value: 90 },
];

export function PolarAnimationStabilityApp({ changed, onAnimationStart, onAnimationEnd }) @{
	<div>
		<PieChart width={400} height={300}>
			<Pie
				dataKey="value"
				data={changed ? changedPieAnimationData : pieAnimationData}
				animationBegin={0}
				animationDuration={1}
				onAnimationStart={onAnimationStart}
				onAnimationEnd={onAnimationEnd}
			/>
		</PieChart>
		<RadarChart
			width={400}
			height={300}
			data={changed ? changedRadarAnimationData : radarAnimationData}
		>
			<PolarAngleAxis dataKey="subject" />
			<PolarRadiusAxis />
			<Radar
				dataKey="value"
				animationBegin={0}
				animationDuration={1}
				onAnimationStart={onAnimationStart}
				onAnimationEnd={onAnimationEnd}
			/>
		</RadarChart>
		<RadialBarChart
			width={400}
			height={300}
			data={changed ? changedRadialBarAnimationData : radialBarAnimationData}
		>
			<PolarAngleAxis type="number" domain={[0, 100]} />
			<RadialBar
				dataKey="value"
				animationBegin={0}
				animationDuration={1}
				onAnimationStart={onAnimationStart}
				onAnimationEnd={onAnimationEnd}
			/>
		</RadialBarChart>
	</div>
}

export function HiddenPieTooltipApp() @{
	<PieChart width={400} height={300}>
		<Tooltip active defaultIndex={0} includeHidden isAnimationActive={false} />
		<Pie
			dataKey="value"
			data={[
				{ name: 'Hidden slice', value: 100 },
			]}
			hide
			isAnimationActive={false}
		/>
	</PieChart>
}

export function HierarchyChartsApp() @{
	<div>
		<Sankey
			width={500}
			height={300}
			data={{
				nodes: [{ name: 'Start' }, { name: 'Middle' }, { name: 'End' }],
				links: [
					{ source: 0, target: 1, value: 10 },
					{ source: 1, target: 2, value: 7 },
				],
			}}
		/>
		<SunburstChart
			width={400}
			height={300}
			data={{
				name: 'root',
				children: [
					{ name: 'A', value: 100, fill: '#8884d8' },
					{ name: 'B', value: 60, fill: '#82ca9d' },
				],
			}}
		/>
	</div>
}
