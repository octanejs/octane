import { useWindowVirtualizer } from '@octanejs/tanstack-virtual';

// Window-virtualizer fixture: the DEFAULT observeWindowRect path gets real
// coverage here — jsdom's window is natively 1024×768, no rect substitution.
export const captured: { instance?: any } = {};

const SIZE_50 = () => 50;

export function WindowList(props: { initialOffset?: number }) @{
	const virtualizer = useWindowVirtualizer({
		count: 100,
		estimateSize: SIZE_50,
		initialOffset: props.initialOffset,
	});
	captured.instance = virtualizer;
	<div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
		@for (const item of virtualizer.getVirtualItems(); key item.key) {
			<div class="wrow" data-index={item.index}>
				{'Row ' + item.index}
			</div>
		}
	</div>
}
