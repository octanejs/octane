export function EventDifferentialScene(props) @{
	<group
		name="parent"
		onClick={(event) => props.record('click:parent', event)}
		onContextMenu={(event) => props.record('context:parent', event)}
		onPointerDown={(event) => props.record('down:parent', event)}
		onPointerMove={(event) => props.record('move:parent', event)}
		onPointerOver={(event) => props.record('over:parent', event)}
		onPointerEnter={(event) => props.record('enter:parent', event)}
		onPointerOut={(event) => props.record('out:parent', event)}
		onPointerLeave={(event) => props.record('leave:parent', event)}
		onPointerMissed={(event) => props.recordMiss('miss:parent', event)}
	>
		<mesh
			name="front"
			position={[0, 0, 1]}
			onClick={(event) => props.record('click:front', event)}
			onContextMenu={(event) => {
				props.record('context:front', event);
				event.stopPropagation();
			}}
			onPointerDown={(event) => props.record('down:front', event)}
			onPointerMove={(event) => props.record('move:front', event)}
			onPointerOver={(event) => props.record('over:front', event)}
			onPointerEnter={(event) => props.record('enter:front', event)}
			onPointerOut={(event) => props.record('out:front', event)}
			onPointerLeave={(event) => props.record('leave:front', event)}
			onPointerMissed={(event) => props.recordMiss('miss:front', event)}
		>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial />
		</mesh>
		<mesh
			name="rear"
			onClick={(event) => props.record('click:rear', event)}
			onContextMenu={(event) => props.record('context:rear', event)}
			onPointerDown={(event) => props.record('down:rear', event)}
			onPointerMove={(event) => props.record('move:rear', event)}
			onPointerOver={(event) => props.record('over:rear', event)}
			onPointerEnter={(event) => props.record('enter:rear', event)}
			onPointerOut={(event) => props.record('out:rear', event)}
			onPointerLeave={(event) => props.record('leave:rear', event)}
			onPointerMissed={(event) => props.recordMiss('miss:rear', event)}
		>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial />
		</mesh>
	</group>
}

export function ReconstructedEventScene(props) @{
	<group>
		<mesh
			name="capture-target"
			onPointerDown={(event) => {
				props.record(`down:${props.version}`, event);
				event.target.setPointerCapture(event.pointerId);
			}}
			onPointerUp={(event) => {
				props.record(`up:${props.version}`, event);
				event.target.releasePointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => props.record(`move:${props.version}`, event)}
			onPointerOver={(event) => props.record(`over:${props.version}`, event)}
			onPointerEnter={(event) => props.record(`enter:${props.version}`, event)}
			onPointerOut={(event) => props.record(`out:${props.version}`, event)}
			onPointerLeave={(event) => props.record(`leave:${props.version}`, event)}
		>
			<boxGeometry args={[1, 1, 1]} />
			<meshBasicMaterial />
		</mesh>
		<group
			args={[props.revision]}
			name={props.reconstructedName}
			position={[10, 0, 0]}
			onPointerMove={(event) => props.record(`move:${props.reconstructedName}`, event)}
		>
			<mesh name="reconstructed-hit">
				<boxGeometry args={[1, 1, 1]} />
				<meshBasicMaterial />
			</mesh>
		</group>
	</group>
}
