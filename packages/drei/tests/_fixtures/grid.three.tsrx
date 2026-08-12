import { Grid } from '@octanejs/drei';

export function GridScene(props) @{
	<Grid
		ref={props.gridRef}
		args={props.args}
		cellColor={props.cellColor}
		sectionColor={props.sectionColor}
		cellSize={props.cellSize}
		sectionSize={props.sectionSize}
		followCamera={props.followCamera}
		infiniteGrid={props.infiniteGrid}
		fadeDistance={props.fadeDistance}
		fadeStrength={props.fadeStrength}
		fadeFrom={props.fadeFrom}
		cellThickness={props.cellThickness}
		sectionThickness={props.sectionThickness}
		side={props.side}
		position={props.position}
		name="grid"
	/>
}
