import { Text3D } from '@octanejs/drei';

export function Text3DScene(props) @{
	@try {
		<Text3D
			ref={props.meshRef}
			font={props.font}
			size={props.size}
			height={props.height}
			bevelEnabled={props.bevelEnabled}
			bevelSize={props.bevelSize}
			letterSpacing={props.letterSpacing}
			lineHeight={props.lineHeight}
			smooth={props.smooth}
			name="text"
			children={['Octane', 7, <meshBasicMaterial color="hotpink" />]}
		/>
	} @pending {
		<group name="loading" />
	}
}
