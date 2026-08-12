import { Center } from '@octanejs/drei';

export function CenterScene(props) @{
	<group name="parent">
		<Center
			ref={props.centerRef}
			top={props.top}
			right={props.right}
			bottom={props.bottom}
			left={props.left}
			front={props.front}
			back={props.back}
			disable={props.disable}
			disableX={props.disableX}
			disableY={props.disableY}
			disableZ={props.disableZ}
			object={props.object}
			precise={props.precise}
			cacheKey={props.cacheKey}
			onCentered={props.onCentered}
			name="container"
		>
			<mesh position={[2, 3, 4]}>
				<boxGeometry args={[2, 4, 6]} />
				<meshBasicMaterial />
			</mesh>
		</Center>
	</group>
}
