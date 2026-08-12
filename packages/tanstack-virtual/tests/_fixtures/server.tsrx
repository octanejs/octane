import { useVirtualizer } from '@octanejs/tanstack-virtual';

export function ServerVirtualList() @{
	const virtualizer = useVirtualizer({
		count: 20,
		getScrollElement: () => null,
		estimateSize: () => 20,
		initialRect: { width: 100, height: 60 },
		initialOffset: 40,
		overscan: 0,
	});
	<p id="server-range">
		{virtualizer.getVirtualItems().map((item) => item.index).join(',')}
		{'/' + virtualizer.getTotalSize()}
	</p>
}
