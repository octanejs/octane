import { useRef, useState } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

export const observerLifecycle = { attached: 0, detached: 0 };
function observeRect(
	_instance: unknown,
	callback: (rect: { width: number; height: number }) => void,
) {
	observerLifecycle.attached++;
	callback({ width: 300, height: 200 });
	return () => {
		observerLifecycle.detached++;
	};
}

export function HydratedVirtualList() @{
	const parent = useRef<HTMLDivElement>(null);
	const [count, setCount] = useState(20);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count,
		getScrollElement: () => parent.current,
		estimateSize: () => 50,
		initialRect: { width: 300, height: 200 },
		observeElementRect: observeRect,
	});
	const items = virtualizer.getVirtualItems();
	<div>
		<button id="grow" onClick={() => setCount((value) => value + 1)}>Grow</button>
		<output id="extent">{String(virtualizer.getTotalSize()) as string}</output>
		<div ref={parent} style={{ height: 200, width: 300, overflow: 'auto' }}>
			<div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
				@for (const item of items; key item.key) {
					<div
						data-row={String(item.key)}
						style={{ position: 'absolute', top: item.start, height: item.size }}
					>{String(item.index) as string}</div>
				}
			</div>
		</div>
	</div>
}
