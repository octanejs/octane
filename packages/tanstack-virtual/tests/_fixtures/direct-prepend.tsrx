import { useLayoutEffect, useRef, useState } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

export function DirectPrepend({ mode }: { mode: 'position' | 'transform' }) {
	const [rows, setRows] = useState(Array.from({ length: 30 }, (_, id) => id));
	const parent = useRef<HTMLDivElement>(null);
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: rows.length,
		getScrollElement: () => parent.current,
		getItemKey: (index) => rows[index],
		estimateSize: () => 50,
		anchorTo: 'end',
		followOnAppend: true,
		directDomUpdates: true,
		directDomUpdatesMode: mode,
	});
	useLayoutEffect(() => virtualizer.scrollToEnd(), []);
	const items = virtualizer.getVirtualItems();
	return <div>
		<button id="prepend" onClick={() => setRows((current) => [-5, -4, -3, -2, -1, ...current])}>
			Prepend
		</button>
		<div id="scroll-container" ref={parent} style={{ height: 200, width: 300, overflow: 'auto' }}>
			<div
				id="inner"
				ref={virtualizer.containerRef}
				style={{ position: 'relative', width: '100%' }}
			>
				@for (const item of items; key item.key) {
					<div
						ref={virtualizer.measureElement}
						data-index={item.index}
						data-row={String(item.key)}
						style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 50 }}
					>{String(item.key) as string}</div>
				}
			</div>
		</div>
	</div>;
}
