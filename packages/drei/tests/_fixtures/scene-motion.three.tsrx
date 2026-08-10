import { Backdrop, BBAnchor, Billboard, Float } from '@octanejs/drei';

export function BillboardScene(props) @{
	<Billboard
		ref={props.groupRef}
		follow={props.follow}
		lockX={props.lockX}
		lockY={props.lockY}
		lockZ={props.lockZ}
	>
		<group name="content" rotation={[0.2, 0.3, 0.4]} />
	</Billboard>
}

export function FloatScene(props) @{
	<Float
		ref={props.groupRef}
		enabled={props.enabled}
		speed={props.speed}
		rotationIntensity={props.rotationIntensity}
		floatIntensity={props.floatIntensity}
		floatingRange={props.floatingRange}
		autoInvalidate={props.autoInvalidate}
	>
		<group name="content" />
	</Float>
}

export function BackdropScene(props) @{
	<Backdrop floor={props.floor} segments={props.segments} receiveShadow name="backdrop">
		<meshBasicMaterial />
	</Backdrop>
}

export function BBAnchorScene(props) @{
	<group name="root">
		<group name="bounded" position={[1, 2, 3]}>
			<mesh>
				<boxGeometry args={[2, 4, 6]} />
				<meshBasicMaterial />
			</mesh>
			<BBAnchor anchor={props.anchor} name="anchor" />
		</group>
	</group>
}
