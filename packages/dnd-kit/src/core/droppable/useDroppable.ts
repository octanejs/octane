import { useCallback } from 'octane';
import type { Data } from '@dnd-kit/abstract';
import { defaultCollisionDetection } from '@dnd-kit/collision';
import { Droppable } from '@dnd-kit/dom';
import type { DroppableInput } from '@dnd-kit/dom';
import { deepEqual } from '@dnd-kit/state';
import { subSlot } from '../../internal';
import { useDeepSignal } from '../../hooks/useDeepSignal';
import { useOnElementChange } from '../../hooks/useOnElementChange';
import { useOnValueChange } from '../../hooks/useOnValueChange';
import { currentValue, type RefOrValue } from '../../utilities/currentValue';
import { useInstance } from '../hooks/useInstance';

export interface UseDroppableInput<T extends Data = Data> extends Omit<
	DroppableInput<T>,
	'element'
> {
	element?: RefOrValue<Element>;
}

export function useDroppable<T extends Data = Data>(input: UseDroppableInput<T>, slot?: symbol) {
	const { collisionDetector, data, disabled, element, id, accept, type } = input;
	const droppable = useInstance(
		(manager) =>
			new Droppable(
				{
					...input,
					register: false,
					element: currentValue(element),
				},
				manager,
			),
		subSlot(slot, 'instance'),
	);
	const tracked = useDeepSignal(droppable, subSlot(slot, 'signal'));

	useOnValueChange(id, () => (droppable.id = id), subSlot(slot, 'id'));
	useOnElementChange(element, (value) => (droppable.element = value), subSlot(slot, 'element'));
	useOnValueChange(
		accept,
		() => (droppable.accept = accept),
		undefined,
		deepEqual,
		subSlot(slot, 'accept'),
	);
	useOnValueChange(
		collisionDetector,
		() => (droppable.collisionDetector = collisionDetector ?? defaultCollisionDetection),
		subSlot(slot, 'collision'),
	);
	useOnValueChange(data, () => data && (droppable.data = data), subSlot(slot, 'data'));
	useOnValueChange(
		disabled,
		() => (droppable.disabled = disabled === true),
		subSlot(slot, 'disabled'),
	);
	useOnValueChange(type, () => (droppable.type = type), subSlot(slot, 'type'));

	return {
		droppable: tracked,
		get isDropTarget() {
			return tracked.isDropTarget;
		},
		ref: useCallback(
			(value: Element | null) => {
				if (
					!value &&
					droppable.element?.isConnected &&
					!droppable.manager?.dragOperation.status.idle
				) {
					return;
				}
				droppable.element = value ?? undefined;
			},
			[droppable],
			subSlot(slot, 'ref'),
		),
	};
}
