import { useWindowVirtualizer } from '@octanejs/tanstack-virtual';

// Differential fixture: window virtualizer on jsdom's native 1024×768 window.
// The scroll buttons redefine window.scrollY and dispatch a window scroll —
// both rig sides share ONE window, so each side's click re-notifies both
// virtualizers with the same value (idempotent); the rig compares after both
// sides' clicks settle.
const SIZE_50 = () => 50;

export function WindowList() @{
	const virtualizer = useWindowVirtualizer({
		count: 200,
		estimateSize: SIZE_50,
		isScrollingResetDelay: 10,
	});
	<div>
		<button
			id="wscroll-500"
			onClick={() => {
				Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
				window.dispatchEvent(new Event('scroll'));
			}}
		>
			w500
		</button>
		<button
			id="wscroll-0"
			onClick={() => {
				Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
				window.dispatchEvent(new Event('scroll'));
			}}
		>
			w0
		</button>
		<div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
			@for (const item of virtualizer.getVirtualItems(); key item.key) {
				<div
					class="wrow"
					data-index={item.index}
					style={{
						position: 'absolute',
						top: '0px',
						left: '0px',
						width: '100%',
						height: item.size + 'px',
						transform: 'translateY(' + item.start + 'px)',
					}}
				>
					{'Row ' + item.index}
				</div>
			}
		</div>
	</div>
}
