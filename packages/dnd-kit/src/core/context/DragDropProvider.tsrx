import { createElement, useEffect, useInsertionEffect, useRef } from 'octane';
import type { Data, DragDropEventHandlers } from '@dnd-kit/abstract';
import { DragDropManager, defaultPreset, resolveCustomizable } from '@dnd-kit/dom';
import type { DragDropManagerInput, Draggable, Droppable } from '@dnd-kit/dom';
import { deepEqual } from '@dnd-kit/state';
import { useLatest } from '../../hooks/useLatest';
import { useOnValueChange } from '../../hooks/useOnValueChange';
import { DragDropContext } from './context';
import { Renderer } from './renderer.tsrx';
import type { OctaneRenderer } from './renderer.tsrx';

export type Events<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>> =
	DragDropEventHandlers<U, V, W>;

export interface DragDropProviderProps<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>> extends DragDropManagerInput {
	children?: unknown;
	manager?: W;
	onBeforeDragStart?: Events<T, U, V, W>['beforedragstart'];
	onCollision?: Events<T, U, V, W>['collision'];
	onDragStart?: Events<T, U, V, W>['dragstart'];
	onDragMove?: Events<T, U, V, W>['dragmove'];
	onDragOver?: Events<T, U, V, W>['dragover'];
	onDragEnd?: Events<T, U, V, W>['dragend'];
}

const changeOptions = [undefined, deepEqual] as const;

export function DragDropProvider<T extends Data = Data, U extends Draggable<T> = Draggable<T>, V extends Droppable<T> = Droppable<T>, W extends DragDropManager<T, U, V> = DragDropManager<T, U, V>>(props: DragDropProviderProps<T, U, V, W>) {
	const {
		children,
		onCollision,
		onBeforeDragStart,
		onDragStart,
		onDragMove,
		onDragOver,
		onDragEnd,
		...input
	} = props;
	const rendererRef = useRef<OctaneRenderer | null>(null);
	const plugins = resolveCustomizable(input.plugins, defaultPreset.plugins);
	const sensors = resolveCustomizable(input.sensors, defaultPreset.sensors);
	const modifiers = resolveCustomizable(input.modifiers, defaultPreset.modifiers);
	const handleBeforeDragStart = useLatest(onBeforeDragStart);
	const handleDragStart = useLatest(onDragStart);
	const handleDragOver = useLatest(onDragOver);
	const handleDragMove = useLatest(onDragMove);
	const handleDragEnd = useLatest(onDragEnd);
	const handleCollision = useLatest(onCollision);
	const manager = useStableInstance<W>(
		() => input.manager ?? new DragDropManager<T, U, V>(input) as W,
	);

	useEffect(() => {
		if (!rendererRef.current) throw new Error('Renderer not found');
		const { renderer, trackRendering } = rendererRef.current;
		const { monitor } = manager;
		manager.renderer = renderer;
		const listeners = [
			monitor.addEventListener('beforedragstart', (event) => {
				const callback = handleBeforeDragStart.current;
				if (callback) trackRendering(() => callback(event, manager));
			}),
			monitor.addEventListener('dragstart', (event) => handleDragStart.current?.(event, manager)),
			monitor.addEventListener('dragover', (event) => {
				const callback = handleDragOver.current;
				if (callback) trackRendering(() => callback(event, manager));
			}),
			monitor.addEventListener('dragmove', (event) => {
				const callback = handleDragMove.current;
				if (callback) trackRendering(() => callback(event, manager));
			}),
			monitor.addEventListener('dragend', (event) => {
				const callback = handleDragEnd.current;
				if (callback) trackRendering(() => callback(event, manager));
			}),
			monitor.addEventListener('collision', (event) => handleCollision.current?.(event, manager)),
		];
		return () => listeners.forEach((dispose) => dispose());
	}, [manager]);

	useOnValueChange(plugins, () => (manager.plugins = plugins), ...changeOptions);
	useOnValueChange(sensors, () => (manager.sensors = sensors), ...changeOptions);
	useOnValueChange(modifiers, () => (manager.modifiers = modifiers), ...changeOptions);

	return createElement(
		DragDropContext.Provider,
		{ value: manager as unknown as DragDropManager },
		createElement(Renderer, { ref: rendererRef }, children),
		children,
	);
}

function useStableInstance<T extends { destroy(): void }>(create: () => T): T {
	const ref = useRef<T | null>(null);
	if (!ref.current) ref.current = create();
	useInsertionEffect(() => () => ref.current?.destroy(), []);
	return ref.current;
}
