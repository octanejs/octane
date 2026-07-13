import { useState } from 'octane';
import type { DragDropManager } from '@dnd-kit/abstract';
import type { CleanupFunction } from '@dnd-kit/state';
import { subSlot } from '../../internal';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';
import { useDragDropManager } from './useDragDropManager';

export interface Instance<T extends DragDropManager<any, any> = DragDropManager<any, any>> {
	manager: T | undefined;
	register(): CleanupFunction | void;
}

export function useInstance<T extends Instance>(
	initializer: (manager: DragDropManager<any, any> | undefined) => T,
	slot?: symbol,
): T {
	const manager = useDragDropManager() ?? undefined;
	const [instance] = useState<T>(() => initializer(manager), subSlot(slot, 'instance'));
	if (instance.manager !== manager) instance.manager = manager;
	useIsomorphicLayoutEffect(instance.register, [manager, instance], subSlot(slot, 'register'));
	return instance;
}
