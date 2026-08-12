import Draggable from '@octanejs/draggable';
import { useRef, useState } from 'octane';

export function ReactDraggableDemo() @{
	const [controlled, setControlled] = useState({ x: 0, y: 0 });
	const uncontrolledRef = useRef<HTMLButtonElement | null>(null);
	const controlledRef = useRef<HTMLButtonElement | null>(null);

	<div>
		<h2 class="demo-title">react-draggable on Octane</h2>
		<p class="demo-blurb">
			Drag the first card on a 10px grid inside its parent. The controlled card returns to the
			position selected by the reset button after each gesture.
		</p>
		<div class="panel" style={{ height: '220px', position: 'relative', overflow: 'hidden' }}>
			<Draggable
				nodeRef={uncontrolledRef}
				bounds="parent"
				grid={[10, 10]}
				defaultPosition={{ x: 20, y: 20 }}
			>
				<button ref={uncontrolledRef} class="btn" data-draggable="uncontrolled">Grid card</button>
			</Draggable>
			<Draggable
				nodeRef={controlledRef}
				position={controlled}
				onDrag={(_event, data) => setControlled({ x: data.x, y: data.y })}
				onStop={(_event, data) => setControlled({ x: data.x, y: data.y })}
			>
				<button ref={controlledRef} class="btn" data-draggable="controlled">Controlled card</button>
			</Draggable>
		</div>
		<button class="btn" onClick={() => setControlled({ x: 0, y: 0 })}>Reset controlled</button>
	</div>
}
