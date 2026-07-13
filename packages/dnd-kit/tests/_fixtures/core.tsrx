import { useLayoutEffect } from 'octane';
import {
	DragDropProvider,
	DragOverlay,
	useDragDropManager,
	useDragDropMonitor,
	useDragOperation,
	useDraggable,
	useDroppable,
} from '@octanejs/dnd-kit';
import { useSortable } from '@octanejs/dnd-kit/sortable';

function ManagerCapture(props) {
	const manager = useDragDropManager();
	useLayoutEffect(() => props.capture(manager), [manager, props.capture]);
	return null;
}

function RegistryBody(props) @{
	const first = useDraggable({
		id: props.firstId,
		data: props.firstData ?? { label: props.firstId },
		disabled: props.firstDisabled,
		element: props.firstElement,
		handle: props.firstHandle,
		sensors: props.firstSensors,
		modifiers: props.firstModifiers,
		plugins: props.firstPlugins,
		alignment: props.firstAlignment,
	});
	const second = useDraggable({ id: 'drag-two', data: { label: 'two' } });
	const firstDrop = useDroppable({
		id: 'drop-one',
		accept: props.dropAccept ?? ['card'],
		collisionDetector: props.dropCollisionDetector,
		data: props.dropData,
		disabled: props.dropDisabled,
		element: props.dropElement,
		type: props.dropType,
	});
	const secondDrop = useDroppable({ id: 'drop-two', type: 'card' });

	useLayoutEffect(() => props.captureInstances({ first, second, firstDrop, secondDrop }), [
		first,
		second,
		firstDrop,
		secondDrop,
		props.captureInstances,
	]);

	<section id="registry-body">
		<button id="drag-one" ref={first.ref} data-disabled={props.firstDisabled as string}>
			<span id="drag-one-handle" ref={first.handleRef}>one</span>
		</button>
		<button id="drag-two" ref={second.ref}>two</button>
		<div id="drop-one" ref={firstDrop.ref}>drop one</div>
		<div id="drop-two" ref={secondDrop.ref}>drop two</div>
	</section>
}

export function RegistryFixture(props) @{
	<DragDropProvider
		manager={props.manager}
		sensors={props.sensors ?? []}
		plugins={props.plugins ?? []}
		modifiers={props.modifiers ?? []}
	>
		<ManagerCapture capture={props.captureManager} />
		<RegistryBody
			firstId={props.firstId}
			firstDisabled={props.firstDisabled}
			firstData={props.firstData}
			firstElement={props.firstElement}
			firstHandle={props.firstHandle}
			firstSensors={props.firstSensors}
			firstModifiers={props.firstModifiers}
			firstPlugins={props.firstPlugins}
			firstAlignment={props.firstAlignment}
			dropAccept={props.dropAccept}
			dropCollisionDetector={props.dropCollisionDetector}
			dropData={props.dropData}
			dropDisabled={props.dropDisabled}
			dropElement={props.dropElement}
			dropType={props.dropType}
			captureInstances={props.captureInstances}
		/>
	</DragDropProvider>
}

function SortableBody(props) @{
	const first = useSortable({
		id: props.firstId,
		index: props.firstIndex,
		group: props.group,
		accept: props.accept,
		alignment: props.alignment,
		collisionDetector: props.collisionDetector,
		collisionPriority: props.collisionPriority,
		data: props.data ?? { label: 'first' },
		disabled: props.disabled,
		element: props.element,
		handle: props.handle,
		modifiers: props.modifiers,
		plugins: props.plugins ?? [],
		sensors: props.sensors,
		target: props.target,
		transition: props.transition,
		type: props.type,
	});
	const second = useSortable({
		id: 'sort-two',
		index: 1,
		group: props.group,
		data: { label: 'second' },
		plugins: [],
	});
	useLayoutEffect(() => props.captureInstances({ first, second }), [
		first,
		second,
		props.captureInstances,
	]);

	<ol>
		<li
			id="sort-one"
			ref={first.ref}
			data-dragging={String(first.isDragging)}
			data-dropping={String(first.isDropping)}
			data-source={String(first.isDragSource)}
			data-target={String(first.isDropTarget)}
		>
			<button id="sort-one-handle" ref={first.handleRef}>first</button>
		</li>
		<li id="sort-two" ref={second.ref}>
			<button id="sort-two-handle" ref={second.handleRef}>second</button>
		</li>
	</ol>
}

export function SortableFixture(props) @{
	<DragDropProvider sensors={[]} plugins={[]} modifiers={[]}>
		<ManagerCapture capture={props.captureManager} />
		<SortableBody
			firstId={props.firstId}
			firstIndex={props.firstIndex}
			group={props.group}
			accept={props.accept}
			alignment={props.alignment}
			collisionDetector={props.collisionDetector}
			collisionPriority={props.collisionPriority}
			data={props.data}
			disabled={props.disabled}
			element={props.element}
			handle={props.handle}
			modifiers={props.modifiers}
			plugins={props.plugins}
			sensors={props.sensors}
			target={props.target}
			transition={props.transition}
			type={props.type}
			captureInstances={props.captureInstances}
		/>
	</DragDropProvider>
}

function InteractionBody(props) @{
	const draggable = useDraggable({ id: 'drag', data: { label: 'Card' } });
	const droppable = useDroppable({ id: 'drop' });
	const operation = useDragOperation();
	useDragDropMonitor({
		onBeforeDragStart: () => props.events.push('monitor:before'),
		onCollision: () => props.events.push('monitor:collision'),
		onDragStart: () => props.events.push('monitor:start'),
		onDragMove: () => props.events.push('monitor:move'),
		onDragOver: () => props.events.push('monitor:over'),
		onDragEnd: (event) => props.events.push(event.canceled ? 'monitor:cancel' : 'monitor:end'),
	});

	<main>
		<button id="drag" ref={draggable.ref}>
			drag
		</button>
		<div id="drop" ref={droppable.ref}>drop</div>
		<output id="operation-source">
			{String(operation.source?.id ?? 'none') as string}
		</output>
		<output id="operation-target">
			{String(operation.target?.id ?? 'none') as string}
		</output>
	</main>
}

export function InteractionFixture(props) @{
	<DragDropProvider
		sensors={props.sensors}
		plugins={props.plugins}
		modifiers={[]}
		onBeforeDragStart={() => props.events.push('provider:before')}
		onCollision={() => props.events.push('provider:collision')}
		onDragStart={() => props.events.push('provider:start')}
		onDragMove={() => props.events.push('provider:move')}
		onDragOver={() => props.events.push('provider:over')}
		onDragEnd={(event) => props.events.push(event.canceled ? 'provider:cancel' : 'provider:end')}
	>
		<ManagerCapture capture={props.captureManager} />
		<InteractionBody events={props.events} />
		<DragOverlay
			className="overlay"
			tag="aside"
			dropAnimation={null}
			disabled={props.overlayDisabled}
		>
			{(source) => <span id="overlay-content">
				{String(source.id) as string}
			</span>}
		</DragOverlay>
	</DragDropProvider>
}

function StaticOverlayBody() @{
	const draggable = useDraggable({ id: 'static-drag' });
	<button id="static-drag" ref={draggable.ref}>drag</button>
}

function StaticOverlayEntity(props) @{
	const draggable = useDraggable({ id: 'overlay-drag' });
	const manager = useDragDropManager();
	useLayoutEffect(() => props.captureRegistry(manager?.registry.draggables), [
		manager,
		props.captureRegistry,
	]);
	<span id="static-overlay" ref={draggable.ref}>static overlay</span>
}

export function StaticOverlayFixture(props) @{
	<DragDropProvider sensors={props.sensors} plugins={props.plugins} modifiers={[]}>
		<ManagerCapture capture={props.captureManager} />
		<StaticOverlayBody />
		<DragOverlay dropAnimation={null}>
			<StaticOverlayEntity captureRegistry={props.captureOverlayRegistry} />
		</DragOverlay>
	</DragDropProvider>
}

export function MonitorOutsideProvider() @{
	useDragDropMonitor({ onDragStart() {} });
	<span>outside</span>
}
