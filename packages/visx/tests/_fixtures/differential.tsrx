import { useState } from 'octane';
import { scaleBand, scaleLinear } from '@octanejs/visx/scale';
import { AxisBottom } from '@octanejs/visx/axis';
import { Bar, LinePath, Pie } from '@octanejs/visx/shape';
import { GridRows } from '@octanejs/visx/grid';
import { Group } from '@octanejs/visx/group';
import { LinearGradient } from '@octanejs/visx/gradient';
import { GlyphCircle } from '@octanejs/visx/glyph';

const points = [
	{ name: 'a', value: 2 },
	{ name: 'b', value: 5 },
	{ name: 'c', value: 3 },
];

export function PrimitiveDifferential() {
	const x = scaleBand({
		domain: points.map((point) => point.name),
		range: [20, 220],
		padding: 0.2,
	});
	const y = scaleLinear({ domain: [0, 5], range: [120, 10] });
	return <svg width={240} height={160} aria-label="differential primitives">
		<LinearGradient id="differential-gradient" from="#12b886" to="#4dabf7" />
		<Group left={5} top={5}>
			<GridRows scale={y} width={220} numTicks={3} />
			{points.map(
				(point) =>
					<Bar
						key={point.name}
						x={x(point.name)}
						y={y(point.value)}
						width={x.bandwidth()}
						height={120 - y(point.value)}
						fill="url(#differential-gradient)"
					/>,
			)}
			<LinePath
				data={points}
				x={(point) => (x(point.name) ?? 0) + x.bandwidth() / 2}
				y={(point) => y(point.value)}
				stroke="#212529"
			/>
			<GlyphCircle left={30} top={20} size={16} fill="#fff" />
			<AxisBottom top={120} scale={x} />
		</Group>
	</svg>;
}

export function LayoutDifferential() {
	return <svg width={180} height={180} aria-label="differential pie">
		<Pie data={[1, 2, 3]} pieValue={(value) => value} outerRadius={70}>
			{({ arcs, path }) =>
				<Group left={90} top={90}>{arcs.map(
					(arc, index) =>
						<path
							key={index}
							d={path(arc) ?? ''}
							fill={['#f03e3e', '#fab005', '#37b24d'][index]}
						/>,
				)}</Group>}
		</Pie>
	</svg>;
}

export function InteractiveDifferential() {
	const [selected, setSelected] = useState('none');
	return <div data-selected={selected}>
		<svg width={80} height={40}>
			<Bar
				data-testid="select-bar"
				x={0}
				y={0}
				width={40}
				height={30}
				onClick={() => setSelected('bar')}
			/>
		</svg>
		<output>
			{selected as string}
		</output>
	</div>;
}
