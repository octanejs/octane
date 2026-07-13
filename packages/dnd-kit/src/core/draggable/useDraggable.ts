import { useCallback } from 'octane';
import type { Data } from '@dnd-kit/abstract';
import { deepEqual } from '@dnd-kit/state';
import { Draggable } from '@dnd-kit/dom';
import type { DraggableInput } from '@dnd-kit/dom';
import { subSlot } from '../../internal';
import { useDeepSignal } from '../../hooks/useDeepSignal';
import { useOnElementChange } from '../../hooks/useOnElementChange';
import { useOnValueChange } from '../../hooks/useOnValueChange';
import { currentValue, type RefOrValue } from '../../utilities/currentValue';
import { useInstance } from '../hooks/useInstance';

export interface UseDraggableInput<T extends Data = Data> extends Omit<
	DraggableInput<T>,
	'handle' | 'element'
> {
	handle?: RefOrValue<Element>;
	element?: RefOrValue<Element>;
}

export function useDraggable<T extends Data = Data>(input: UseDraggableInput<T>, slot?: symbol) {
	const { disabled, data, element, handle, id, modifiers, sensors, plugins } = input;
	const draggable = useInstance(
		(manager) =>
			new Draggable(
				{
					...input,
					register: false,
					handle: currentValue(handle),
					element: currentValue(element),
				},
				manager,
			),
		subSlot(slot, 'instance'),
	);
	const tracked = useDeepSignal(draggable, shouldUpdateSynchronously, subSlot(slot, 'signal'));

	useOnValueChange(id, () => (draggable.id = id), subSlot(slot, 'id'));
	useOnElementChange(handle, (value) => (draggable.handle = value), subSlot(slot, 'handle'));
	useOnElementChange(element, (value) => (draggable.element = value), subSlot(slot, 'element'));
	useOnValueChange(data, () => data && (draggable.data = data), subSlot(slot, 'data'));
	useOnValueChange(
		disabled,
		() => (draggable.disabled = disabled === true),
		subSlot(slot, 'disabled'),
	);
	useOnValueChange(
		sensors,
		() => (draggable.sensors = sensors),
		undefined,
		deepEqual,
		subSlot(slot, 'sensors'),
	);
	useOnValueChange(
		modifiers,
		() => (draggable.modifiers = modifiers),
		undefined,
		deepEqual,
		subSlot(slot, 'modifiers'),
	);
	useOnValueChange(
		plugins,
		() => (draggable.plugins = plugins),
		undefined,
		deepEqual,
		subSlot(slot, 'plugins'),
	);
	useOnValueChange(
		input.alignment,
		() => (draggable.alignment = input.alignment),
		subSlot(slot, 'alignment'),
	);

	return {
		draggable: tracked,
		get isDragging() {
			return tracked.isDragging;
		},
		get isDropping() {
			return tracked.isDropping;
		},
		get isDragSource() {
			return tracked.isDragSource;
		},
		handleRef: useCallback(
			(value: Element | null) => {
				draggable.handle = value ?? undefined;
			},
			[draggable],
			subSlot(slot, 'handle-ref'),
		),
		ref: useCallback(
			(value: Element | null) => {
				if (
					!value &&
					draggable.element?.isConnected &&
					!draggable.manager?.dragOperation.status.idle
				) {
					return;
				}
				draggable.element = value ?? undefined;
			},
			[draggable],
			subSlot(slot, 'ref'),
		),
	};
}

function shouldUpdateSynchronously(key: string, oldValue: any, newValue: any): boolean {
	return key === 'isDragSource' && !newValue && oldValue;
}
