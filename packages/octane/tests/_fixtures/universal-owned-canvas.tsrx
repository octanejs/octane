import { useRef } from 'octane';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalHostBoundary,
	createUniversalRoot,
} from '../../src/universal.js';

const ObjectBoundary = createUniversalHostBoundary('object');
const ownedContainers = new WeakMap();

export function getOwnedCanvasContainer(canvas) {
	const container = ownedContainers.get(canvas);
	if (container === undefined) throw new Error('The Canvas host is not mounted.');
	return container;
}

export function Canvas(props) @{
	const state = useRef(null);
	if (state.current === null) {
		const container = createObjectContainer();
		state.current = {
			container,
			root: createUniversalRoot(container, createObjectDriver()),
		};
	}
	const current = state.current;
	<>
		<canvas
			class="owned-object-canvas"
			ref={(node) => {
				if (node !== null) ownedContainers.set(node, current.container);
			}}
		/>
		<ObjectBoundary root={current.root} children={props.children} />
	</>
}
