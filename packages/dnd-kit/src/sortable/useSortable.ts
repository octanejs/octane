import { useCallback } from 'octane';
import type { Data } from '@dnd-kit/abstract';
import { Sortable, defaultSortableTransition } from '@dnd-kit/dom/sortable';
import type { SortableInput } from '@dnd-kit/dom/sortable';
import { batch, deepEqual } from '@dnd-kit/state';
import { useInstance } from '../core/hooks/useInstance';
import { subSlot } from '../internal';
import { useDeepSignal } from '../hooks/useDeepSignal';
import { useImmediateEffect } from '../hooks/useImmediateEffect';
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
import { useOnElementChange } from '../hooks/useOnElementChange';
import { useOnValueChange } from '../hooks/useOnValueChange';
import { currentValue, type RefOrValue } from '../utilities/currentValue';

export interface UseSortableInput<T extends Data = Data> extends Omit<
	SortableInput<T>,
	'handle' | 'element' | 'target'
> {
	handle?: RefOrValue<Element>;
	element?: RefOrValue<Element>;
	target?: RefOrValue<Element>;
}

export function useSortable<T extends Data = Data>(input: UseSortableInput<T>, slot?: symbol) {
	const {
		accept,
		collisionDetector,
		collisionPriority,
		id,
		data,
		element,
		handle,
		index,
		group,
		disabled,
		modifiers,
		sensors,
		target,
		type,
		plugins,
	} = input;
	const transition = { ...defaultSortableTransition, ...input.transition };
	const sortable = useInstance(
		(manager) =>
			new Sortable(
				{
					...input,
					transition,
					register: false,
					handle: currentValue(handle),
					element: currentValue(element),
					target: currentValue(target),
				},
				manager,
			),
		subSlot(slot, 'instance'),
	);
	const tracked = useDeepSignal(sortable, shouldUpdateSynchronously, subSlot(slot, 'signal'));

	useOnValueChange(id, () => (sortable.id = id), subSlot(slot, 'id'));
	useIsomorphicLayoutEffect(
		() => {
			batch(() => {
				sortable.group = group;
				sortable.index = index;
			});
		},
		[sortable, group, index],
		subSlot(slot, 'position'),
	);
	useOnValueChange(type, () => (sortable.type = type), subSlot(slot, 'type'));
	useOnValueChange(
		accept,
		() => (sortable.accept = accept),
		undefined,
		deepEqual,
		subSlot(slot, 'accept'),
	);
	useOnValueChange(data, () => data && (sortable.data = data), subSlot(slot, 'data'));
	useOnValueChange(
		index,
		() => {
			if (sortable.manager?.dragOperation.status.idle && transition.idle) {
				sortable.refreshShape();
			}
		},
		useImmediateEffect,
		undefined,
		subSlot(slot, 'refresh'),
	);
	useOnElementChange(handle, (value) => (sortable.handle = value), subSlot(slot, 'handle'));
	useOnElementChange(element, (value) => (sortable.element = value), subSlot(slot, 'element'));
	useOnElementChange(target, (value) => (sortable.target = value), subSlot(slot, 'target'));
	useOnValueChange(
		disabled,
		() => (sortable.disabled = disabled ?? false),
		undefined,
		deepEqual,
		subSlot(slot, 'disabled'),
	);
	useOnValueChange(
		sensors,
		() => (sortable.sensors = sensors),
		undefined,
		deepEqual,
		subSlot(slot, 'sensors'),
	);
	useOnValueChange(
		collisionDetector,
		() => (sortable.collisionDetector = collisionDetector),
		subSlot(slot, 'collision'),
	);
	useOnValueChange(
		collisionPriority,
		() => (sortable.collisionPriority = collisionPriority),
		subSlot(slot, 'priority'),
	);
	useOnValueChange(
		plugins,
		() => (sortable.plugins = plugins),
		undefined,
		deepEqual,
		subSlot(slot, 'plugins'),
	);
	useOnValueChange(
		transition,
		() => (sortable.transition = transition),
		undefined,
		deepEqual,
		subSlot(slot, 'transition'),
	);
	useOnValueChange(
		modifiers,
		() => (sortable.modifiers = modifiers),
		undefined,
		deepEqual,
		subSlot(slot, 'modifiers'),
	);
	useOnValueChange(
		input.alignment,
		() => (sortable.alignment = input.alignment),
		subSlot(slot, 'alignment'),
	);

	const keepDuringDrag = (value: Element | null, current: Element | undefined) =>
		!value && current?.isConnected && !sortable.manager?.dragOperation.status.idle;

	return {
		sortable: tracked,
		get isDragging() {
			return tracked.isDragging;
		},
		get isDropping() {
			return tracked.isDropping;
		},
		get isDragSource() {
			return tracked.isDragSource;
		},
		get isDropTarget() {
			return tracked.isDropTarget;
		},
		handleRef: useCallback(
			(value: Element | null) => {
				sortable.handle = value ?? undefined;
			},
			[sortable],
			subSlot(slot, 'handle-ref'),
		),
		ref: useCallback(
			(value: Element | null) => {
				if (!keepDuringDrag(value, sortable.element)) sortable.element = value ?? undefined;
			},
			[sortable],
			subSlot(slot, 'ref'),
		),
		sourceRef: useCallback(
			(value: Element | null) => {
				if (!keepDuringDrag(value, sortable.source)) sortable.source = value ?? undefined;
			},
			[sortable],
			subSlot(slot, 'source-ref'),
		),
		targetRef: useCallback(
			(value: Element | null) => {
				if (!keepDuringDrag(value, sortable.target)) sortable.target = value ?? undefined;
			},
			[sortable],
			subSlot(slot, 'target-ref'),
		),
	};
}

function shouldUpdateSynchronously(key: string, oldValue: any, newValue: any): boolean {
	return key === 'isDragSource' && !newValue && oldValue;
}
