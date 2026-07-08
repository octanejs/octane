import {
	Surface,
	Layer,
	Rectangle,
	Dot,
	Cross,
	Polygon,
	Curve,
	Sector,
	Symbols,
	Trapezoid,
} from '@octanejs/recharts';

// Differential fixture: the Phase 0 SVG primitives rendered with fixed
// geometry — the SAME source runs through @octanejs/recharts (octane) and real
// recharts (React); the emitted SVG must be byte-identical.

export function ShapesApp() @{
	<Surface width={400} height={240}>
		<Layer className="row-one">
			<Rectangle x={10} y={10} width={80} height={40} fill="#8884d8" />
			<Rectangle x={110} y={10} width={80} height={40} radius={8} fill="#82ca9d" />
			<Rectangle
				x={210}
				y={10}
				width={80}
				height={40}
				radius={[4, 8, 0, 12]}
				fill="#ffc658"
				stroke="#333"
			/>
			<Rectangle x={310} y={60} width={60} height={-40} fill="#d88484" />
		</Layer>
		<Layer className="row-two">
			<Dot cx={40} cy={100} r={12} fill="#8884d8" />
			<Dot cx={90} cy={100} r={6} fill="none" stroke="#82ca9d" strokeWidth={2} />
			<Cross x={200} y={100} top={70} left={160} width={80} height={60} stroke="#666" />
		</Layer>
		<Layer className="row-three">
			<Polygon
				points={[
					{ x: 40, y: 160 },
					{ x: 90, y: 200 },
					{ x: 20, y: 220 },
				]}
				fill="#8884d8"
			/>
			<Polygon
				points={[
					{ x: 140, y: 160 },
					{ x: 200, y: 170 },
					{ x: 210, y: 220 },
					{ x: 150, y: 210 },
				]}
				baseLinePoints={[
					{ x: 145, y: 180 },
					{ x: 195, y: 185 },
					{ x: 200, y: 210 },
					{ x: 155, y: 205 },
				]}
				stroke="#82ca9d"
				fill="#c6e5d2"
			/>
		</Layer>
		<Layer className="row-four">
			<Curve
				type="linear"
				points={[
					{ x: 240, y: 160 },
					{ x: 270, y: 190 },
					{ x: 300, y: 165 },
					{ x: 330, y: 210 },
				]}
				stroke="#8884d8"
				fill="none"
			/>
			<Curve
				type="monotone"
				points={[
					{ x: 240, y: 220 },
					{ x: 270, y: 195 },
					{ x: null, y: 200 },
					{ x: 330, y: 230 },
				]}
				connectNulls
				stroke="#82ca9d"
				fill="none"
			/>
			<Curve
				type="natural"
				points={[
					{ x: 340, y: 160 },
					{ x: 360, y: 180 },
					{ x: 390, y: 170 },
				]}
				baseLine={230}
				fill="#c6e5d2"
			/>
			<Curve
				type="step"
				points={[
					{ x: 240, y: 140 },
					{ x: 300, y: 150 },
					{ x: 390, y: 135 },
				]}
				baseLine={[
					{ x: 240, y: 155 },
					{ x: 300, y: 158 },
					{ x: 390, y: 150 },
				]}
				stroke="#ffc658"
				fill="#f4e3b2"
			/>
		</Layer>
		<Layer className="row-five">
			<Sector
				cx={40}
				cy={40}
				innerRadius={0}
				outerRadius={30}
				startAngle={0}
				endAngle={240}
				fill="#8884d8"
			/>
			<Sector
				cx={120}
				cy={40}
				innerRadius={12}
				outerRadius={30}
				startAngle={90}
				endAngle={-90}
				fill="#82ca9d"
			/>
			<Sector
				cx={200}
				cy={40}
				innerRadius={10}
				outerRadius={32}
				startAngle={30}
				endAngle={300}
				cornerRadius={6}
				fill="#ffc658"
			/>
			<Sector
				cx={280}
				cy={40}
				innerRadius={0}
				outerRadius={28}
				startAngle={45}
				endAngle={47}
				cornerRadius={8}
				forceCornerRadius
				fill="#d88484"
			/>
			<Sector
				cx={360}
				cy={40}
				innerRadius={14}
				outerRadius={30}
				startAngle={200}
				endAngle={-40}
				cornerRadius="15%"
				cornerIsExternal
				fill="#84b6d8"
			/>
		</Layer>
		<Layer className="row-six">
			<Symbols cx={20} cy={120} type="circle" size={64} fill="#8884d8" />
			<Symbols cx={50} cy={120} type="cross" size={64} fill="#82ca9d" />
			<Symbols cx={80} cy={120} type="diamond" size={64} fill="#ffc658" />
			<Symbols cx={110} cy={120} type="square" size={64} fill="#d88484" />
			<Symbols cx={140} cy={120} type="star" size={80} sizeType="diameter" fill="#84b6d8" />
			<Symbols cx={170} cy={120} type="triangle" size={64} fill="#8884d8" />
			<Symbols cx={200} cy={120} type="wye" size={64} fill="#82ca9d" />
			<Trapezoid x={240} y={100} upperWidth={60} lowerWidth={30} height={40} fill="#8884d8" />
			<Trapezoid
				x={320}
				y={100}
				upperWidth={20}
				lowerWidth={56}
				height={40}
				stroke="#333"
				fill="#c6e5d2"
			/>
		</Layer>
	</Surface>
}
