import { Activity } from 'octane';
import { useState as useThreeState } from '@octanejs/three/renderer';

export function EventScene(props) @{
	<group
		name="parent"
		ref={props.parentRef}
		onClick={props.onParentClick}
		onPointerDown={props.onParentPointerDown}
		onPointerMove={props.onParentPointerMove}
		onPointerOver={props.onParentPointerOver}
		onPointerOut={props.onParentPointerOut}
		onPointerEnter={props.onParentPointerEnter}
		onPointerLeave={props.onParentPointerLeave}
		onPointerMissed={props.onParentPointerMissed}
	>
		@if (props.showFront) {
			<mesh
				name="front"
				position={[0, 0, 1]}
				ref={props.frontRef}
				onClick={props.onFrontClick}
				onContextMenu={props.onFrontContextMenu}
				onDoubleClick={props.onFrontDoubleClick}
				onWheel={props.onFrontWheel}
				onPointerDown={props.onFrontPointerDown}
				onPointerUp={props.onFrontPointerUp}
				onPointerMove={props.onFrontPointerMove}
				onPointerOver={props.onFrontPointerOver}
				onPointerOut={props.onFrontPointerOut}
				onPointerEnter={props.onFrontPointerEnter}
				onPointerLeave={props.onFrontPointerLeave}
				onPointerMissed={props.onFrontPointerMissed}
			>
				<boxGeometry args={[1, 1, 1]} />
				<meshBasicMaterial />
			</mesh>
		}
		<mesh
			name="rear"
			position={[0, 0, 0]}
			ref={props.rearRef}
			onClick={props.onRearClick}
			onPointerDown={props.onRearPointerDown}
			onPointerMove={props.onRearPointerMove}
			onPointerOver={props.onRearPointerOver}
			onPointerOut={props.onRearPointerOut}
			onPointerEnter={props.onRearPointerEnter}
			onPointerLeave={props.onRearPointerLeave}
			onPointerMissed={props.onRearPointerMissed}
		>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial />
		</mesh>
	</group>
}

export function PrimitiveEventScene(props) @{
	<primitive
		object={props.object}
		ref={props.objectRef}
		raycast={props.raycast}
		onPointerDown={props.onPointerDown}
		onPointerMove={props.onPointerMove}
		onPointerOver={props.onPointerOver}
		onPointerOut={props.onPointerOut}
		onPointerLeave={props.onPointerLeave}
		onPointerMissed={props.onPointerMissed}
	/>
}

export function PrimitiveStackEventScene(props) @{
	<group>
		<primitive
			object={props.object}
			onPointerMove={props.onFrontPointerMove}
			onPointerOver={props.onFrontPointerOver}
			onPointerOut={props.onFrontPointerOut}
		/>
		<mesh
			name="nested-rear"
			onPointerMove={props.onRearPointerMove}
			onPointerOver={props.onRearPointerOver}
			onPointerOut={props.onRearPointerOut}
		>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial />
		</mesh>
	</group>
}

export function PrimitiveParentEventScene(props) @{
	<group name="primitive-parent" onPointerDown={props.onPointerDown}>
		<primitive object={props.object} />
	</group>
}

export function ArgsEventScene(props) @{
	<mesh
		args={props.args}
		name="args-mesh"
		ref={props.objectRef}
		onPointerDown={props.onPointerDown}
	>
		<boxGeometry args={[1, 1, 1]} />
		<meshBasicMaterial />
	</mesh>
}

export function ActivityEventScene(props) @{
	<group name="activity-parent" onPointerDown={props.onParentPointerDown}>
		<Activity mode={props.mode}>
			<mesh
				name="activity-child"
				raycast={props.childRaycast}
				onPointerDown={props.onChildPointerDown}
			>
				<boxGeometry args={[1, 1, 1]} />
				<meshBasicMaterial />
			</mesh>
		</Activity>
	</group>
}

export function ScopedEventScene(props) @{
	const [showRear, setShowRear] = useThreeState(true);

	<group>
		<mesh
			name="front"
			position={[0, 0, 1]}
			onPointerDown={() => {
				props.onEvent('front');
				setShowRear(false);
			}}
		>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial />
		</mesh>
		@if (showRear) {
			<mesh name="rear" onPointerDown={() => props.onEvent('rear')}>
				<boxGeometry args={[1, 1, 1]} />
				<meshBasicMaterial />
			</mesh>
		}
	</group>
}

export function ContinuousTestingEventScene(props) @{
	const [name, setName] = useThreeState('before');

	<mesh
		name={name}
		onPointerMove={() => {
			setName('after');
			props.onEvent();
		}}
	/>
}
