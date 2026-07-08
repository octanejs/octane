import { BarChart, LineChart, Bar, Line, XAxis, YAxis } from '@octanejs/recharts';

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
