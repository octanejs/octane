import { Svg } from '@octanejs/drei';

export function SvgScene(props) @{
	@try {
		<Svg
			ref={props.objectRef}
			src={props.src}
			skipFill={props.skipFill}
			skipStrokes={props.skipStrokes}
			fillMaterial={{ opacity: 0.6 }}
			strokeMaterial={{ opacity: 0.7 }}
			fillMeshProps={{ name: 'fill' }}
			strokeMeshProps={{ name: 'stroke' }}
			name="svg"
			position={[1, 2, 3]}
		/>
	} @pending {
		<group name="loading" />
	}
}
