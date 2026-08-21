import { useImperativeHandle, useRef } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import { subSlot } from '../../internal';
import { getImperativePanelMethods } from '../../global/utils/getImperativePanelMethods';
import { useIsomorphicLayoutEffect } from '../../hooks/useIsomorphicLayoutEffect';
import { useMergedRefs } from '../../hooks/useMergedRefs';
import { useGroupContext } from '../group/useGroupContext';
import type { PanelImperativeHandle } from './types';

const noop = () => {};

export function usePanelImperativeHandle(
	panelId: string,
	panelRef: Octane.Ref<PanelImperativeHandle | null> | undefined,
	slot?: symbol,
) {
	const { id: groupId } = useGroupContext();
	const imperativePanelRef = useRef<PanelImperativeHandle>(
		{
			collapse: noop,
			expand: noop,
			getSize: () => ({ asPercentage: 0, inPixels: 0 }),
			isCollapsed: () => false,
			resize: noop,
		},
		subSlot(slot, 'ref'),
	);
	const mergedPanelRef = useMergedRefs(panelRef, subSlot(slot, 'merged-ref'));
	useImperativeHandle(
		mergedPanelRef,
		() => imperativePanelRef.current,
		[],
		subSlot(slot, 'handle'),
	);
	useIsomorphicLayoutEffect(
		() => {
			Object.assign(imperativePanelRef.current, getImperativePanelMethods({ groupId, panelId }));
		},
		[groupId, panelId],
		subSlot(slot, 'effect'),
	);
}
