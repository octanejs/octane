import { CatmullRomLine, CubicBezierLine, Edges, Line, QuadraticBezierLine } from '@octanejs/drei';

export function LineScene(props) @{
	<Line
		ref={props.lineRef}
		points={props.points}
		vertexColors={props.vertexColors}
		lineWidth={props.lineWidth}
		segments={props.segments}
		dashed={props.dashed}
		color={props.color}
		name="line"
	/>
}

export function QuadraticScene(props) @{
	<QuadraticBezierLine
		ref={props.lineRef}
		start={props.start}
		end={props.end}
		mid={props.mid}
		segments={props.segments}
	/>
}

export function CubicScene(props) @{
	<CubicBezierLine
		ref={props.lineRef}
		start={props.start}
		end={props.end}
		midA={props.midA}
		midB={props.midB}
		segments={props.segments}
	/>
}

export function CatmullScene(props) @{
	<CatmullRomLine
		ref={props.lineRef}
		points={props.points}
		closed={props.closed}
		curveType={props.curveType}
		tension={props.tension}
		segments={props.segments}
		vertexColors={props.vertexColors}
	/>
}

export function EdgesScene(props) @{
	<mesh>
		<boxGeometry args={[2, 3, 4]} />
		<meshBasicMaterial />
		<Edges ref={props.edgesRef} threshold={props.threshold} color="red" lineWidth={2} />
	</mesh>
}
