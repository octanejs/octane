import { useMemo, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';
import {
	DndContext,
	DragOverlay,
	KeyboardSensor,
	MouseSensor,
	PointerSensor,
	closestCorners,
	useDndContext,
	useDndMonitor,
	useDraggable,
	useDroppable,
	useSensor,
	useSensors,
} from '@octanejs/dnd-kit-core';
import type {
	DragEndEvent,
	DragOverEvent,
	DragStartEvent,
	DropAnimationFunction,
	UniqueIdentifier,
} from '@octanejs/dnd-kit-core';
import { CSS } from '@octanejs/dnd-kit-utilities';

function Card(props: { id: string }) @{
	const draggable = useDraggable({ id: props.id, data: { kind: 'card' } });
	<button
		type="button"
		ref={draggable.setNodeRef}
		id={`card-${props.id}` as string}
		data-dragging={String(draggable.isDragging)}
		data-over={String(draggable.over?.id ?? 'none')}
		style={{ transform: CSS.Translate.toString(draggable.transform) }}
		{...draggable.listeners}
		{...draggable.attributes}
	>
		{props.id as string}
	</button>
}

function Zone(props: { id: string; children?: OctaneNode }) @{
	const droppable = useDroppable({ id: props.id, data: { accepts: 'card' } });
	<section
		ref={droppable.setNodeRef}
		id={`zone-${props.id}` as string}
		data-over={String(droppable.isOver)}
		data-active={String(droppable.active?.id ?? 'none')}
	>
		{props.children}
	</section>
}

function ContextProbe() @{
	const context = useDndContext();
	<output id="context">{`${String(context.active?.id ?? 'none')}:${String(
		context.over?.id ?? 'none',
	)}:${context.measuringScheduled ? 'measuring' : 'idle'}`}</output>
}

function MonitorLog() @{
	const [entries, setEntries] = useState('monitor');
	useDndMonitor({
		onDragStart: (event: DragStartEvent) =>
			setEntries((previous) => `${previous}|start:${String(event.active.id)}`),
		onDragOver: (event: DragOverEvent) =>
			setEntries((previous) => `${previous}|over:${String(event.over?.id ?? 'none')}`),
		onDragEnd: (event: DragEndEvent) =>
			setEntries((previous) => `${previous}|end:${String(event.over?.id ?? 'none')}`),
		onDragCancel: () => setEntries((previous) => `${previous}|cancel`),
	});
	<output id="monitor">{entries as string}</output>
}

function Board(props: { cards: Record<string, string> }) @{
	<>
		<nav id="tray">
			@for (
				const id of Object.keys(props.cards).filter((card) => props.cards[card] === 'tray');
				key id
			) {
				<Card id={id} />
			}
		</nav>
		@for (const zone of ['left', 'right']; key zone) {
			<Zone id={zone}>
				@for (
					const id of Object.keys(props.cards).filter((card) => props.cards[card] === zone);
					key id
				) {
					<Card id={id} />
				}
			</Zone>
		}
	</>
}

/**
 * Pointer drag through a DragOverlay whose drop animation stays pending until
 * `#finish-drop` resolves it, so the cloned overlay is observable.
 */
export function PointerOverlayBoard() @{
	const [cards, setCards] = useState<Record<string, string>>({ a: 'tray', b: 'tray' });
	const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
	const pending = useRef<(() => void) | null>(null);
	const dropAnimation = useMemo<DropAnimationFunction>(
		() => () =>
			new Promise<void>((resolve) => {
				pending.current = resolve;
			}),
		[],
	);
	const sensors = useSensors(useSensor(PointerSensor));
	<DndContext
		sensors={sensors}
		onDragStart={(event: DragStartEvent) => setActiveId(event.active.id)}
		onDragEnd={(event: DragEndEvent) => {
			setActiveId(null);
			const over = event.over;
			if (over) {
				setCards((previous) => ({ ...previous, [String(event.active.id)]: String(over.id) }));
			}
		}}
	>
		<Board cards={cards} />
		<ContextProbe />
		<MonitorLog />
		<button
			type="button"
			id="finish-drop"
			onClick={() => {
				pending.current?.();
				pending.current = null;
			}}
		>
			finish drop
		</button>
		<DragOverlay dropAnimation={dropAnimation} zIndex={5}>
			{activeId != null ? <div id="overlay">{`dragging ${String(activeId)}`}</div> : null}
		</DragOverlay>
	</DndContext>
}

/** Keyboard drag with the default screen-reader announcements and instructions. */
export function KeyboardBoard() @{
	const [cards, setCards] = useState<Record<string, string>>({ a: 'tray', b: 'left' });
	const sensors = useSensors(useSensor(KeyboardSensor));
	<DndContext
		sensors={sensors}
		collisionDetection={closestCorners}
		onDragEnd={(event: DragEndEvent) => {
			const over = event.over;
			if (over) {
				setCards((previous) => ({ ...previous, [String(event.active.id)]: String(over.id) }));
			}
		}}
	>
		<Board cards={cards} />
		<ContextProbe />
		<MonitorLog />
	</DndContext>
}

/** Mouse drag with custom announcements rendered into an explicit container. */
export function MouseBoard() @{
	const [cards, setCards] = useState<Record<string, string>>({ a: 'tray', b: 'tray' });
	const [container, setContainer] = useState<HTMLElement | null>(null);
	const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }));
	<div>
		<DndContext
			id="mouse-board"
			sensors={sensors}
			accessibility={{
				container: container ?? undefined,
				announcements: {
					onDragStart: ({ active }) => `lifted ${String(active.id)}`,
					onDragOver: ({ over }) => `over ${String(over?.id ?? 'nothing')}`,
					onDragEnd: ({ over }) => `dropped on ${String(over?.id ?? 'nothing')}`,
					onDragCancel: () => 'cancelled',
				},
				screenReaderInstructions: { draggable: 'Use a mouse.' },
			}}
			onDragEnd={(event: DragEndEvent) => {
				const over = event.over;
				if (over) {
					setCards((previous) => ({ ...previous, [String(event.active.id)]: String(over.id) }));
				}
			}}
		>
			<Board cards={cards} />
			<MonitorLog />
		</DndContext>
		<aside id="announcer" ref={setContainer} />
	</div>
}
