import { useState } from 'octane';
import { scaleBand } from '@octanejs/visx/scale';
import { AxisBottom } from '@octanejs/visx/axis';
import { Bar } from '@octanejs/visx/shape';
import { LinearGradient } from '@octanejs/visx/gradient';
import { ClipPath } from '@octanejs/visx/clip-path';
import { PatternLines } from '@octanejs/visx/pattern';
import { MarkerArrow } from '@octanejs/visx/marker';
import { Text } from '@octanejs/visx/text';
import { Annotation, CircleSubject, Connector, Label } from '@octanejs/visx/annotation';
import { BarSeries, LineSeries, XYChart } from '@octanejs/visx/xychart';
import { Wordcloud } from '@octanejs/visx/wordcloud';

const data = [
	{ name: 'a', value: 2 },
	{ name: 'b', value: 5 },
];
const xAccessor = (datum: (typeof data)[number]) => datum.name;
const yAccessor = (datum: (typeof data)[number]) => datum.value;

function HydrationSeries() {
	return <>
		<BarSeries dataKey="bars" data={data} xAccessor={xAccessor} yAccessor={yAccessor} />
		<LineSeries dataKey="line" data={data} xAccessor={xAccessor} yAccessor={yAccessor} />
	</>;
}

export function HydrationFixture() {
	const [selected, setSelected] = useState('ready');
	const x = scaleBand({ domain: data.map(xAccessor), range: [20, 180], padding: 0.2 });
	return <main id="visx-hydration-fixture">
		<button id="visx-hydration-button" onClick={() => setSelected('clicked')}>select</button>
		<output id="visx-hydration-output">
			{selected as string}
		</output>
		<svg id="visx-hydration-svg" width={200} height={110} aria-label="hydration definitions">
			<LinearGradient from="#15aabf" to="#7950f2" />
			<ClipPath>
				<rect width={180} height={80} />
			</ClipPath>
			<PatternLines width={6} height={6} stroke="#868e96" />
			<MarkerArrow refX={4} />
			<Bar x={30} y={20} width={40} height={50} fill="#15aabf" />
			<AxisBottom top={70} scale={x} tickValues={['a', 'b']} />
			<Text x={100} y={100} textAnchor="middle">Hydration text</Text>
			<Annotation x={145} y={24} dx={18} dy={12}>
				<Connector />
				<CircleSubject />
				<Label className="hydration-annotation" title="Stable" subtitle="annotation" />
			</Annotation>
		</svg>
		<XYChart
			accessibilityLabel="hydration xy chart"
			width={240}
			height={160}
			xScale={{ type: 'band', domain: data.map(xAccessor), paddingInner: 0.2 }}
			yScale={{ type: 'linear', domain: [0, 5] }}
		>
			<HydrationSeries />
		</XYChart>
		<Wordcloud
			width={220}
			height={100}
			words={[{ text: 'hydrated', value: 196 }, { text: 'words', value: 144 }]}
			rotate={0}
			fontSize={(word) => Math.sqrt(word.value)}
		>
			{(words) => words.map(
				(word) => <text
					className="hydration-word"
					key={word.text}
					x={word.x}
					y={word.y}
					fontSize={word.size}
				>{word.text}</text>,
			)}
		</Wordcloud>
	</main>;
}
