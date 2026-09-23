import { useEffect, useState } from 'octane';

import { ReactFlowState } from '../../types';
import { useStore } from '../../hooks/useStore';
import { resolveHookSlot, subSlot } from '../../hooks/slot';
import { InternalNodeUpdate } from '@xyflow/system';

const selector = (s: ReactFlowState) => s.updateNodeInternals;

export function useResizeObserver(...rest: [slot?: symbol]) {
	const slot = resolveHookSlot(rest);
	const updateNodeInternals = useStore(selector, undefined, subSlot(slot, 'update-internals'));
	const [resizeObserver] = useState(
		() => {
			if (typeof ResizeObserver === 'undefined') {
				return null;
			}

			return new ResizeObserver((entries: ResizeObserverEntry[]) => {
				const updates = new Map<string, InternalNodeUpdate>();
				entries.forEach((entry: ResizeObserverEntry) => {
					const id = entry.target.getAttribute('data-id') as string;
					updates.set(id, {
						id,
						nodeElement: entry.target as HTMLDivElement,
						force: true,
					});
				});

				updateNodeInternals(updates);
			});
		},
		subSlot(slot, 'observer'),
	);

	useEffect(
		() => {
			return () => {
				resizeObserver?.disconnect();
			};
		},
		[resizeObserver],
		subSlot(slot, 'disconnect'),
	);

	return resizeObserver;
}
