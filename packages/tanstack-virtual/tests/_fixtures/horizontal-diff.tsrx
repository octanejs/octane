import { useRef } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

// Differential fixture: horizontal virtualization — width-major rect,
// scrollLeft driving, translateX positions.
const RECT = { width: 300, height: 50 };
const SIZE_25 = () => 25;
const OBSERVE_RECT = (_instance: any, cb: (rect: typeof RECT) => void) => {
	cb(RECT);
	return () => {};
};

export function HorizontalList() @{
	const scrollRef = useRef(null as any);
	const virtualizer = useVirtualizer({
		count: 80,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_25,
		horizontal: true,
		isScrollingResetDelay: 10,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
	});
	<div>
		<button
			id="hscroll-300"
			onClick={() => {
				scrollRef.current.scrollLeft = 300;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			h300
		</button>
		<button
			id="hscroll-0"
			onClick={() => {
				scrollRef.current.scrollLeft = 0;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			h0
		</button>
		<div id="hscroller" ref={scrollRef} style={{ width: '300px', overflow: 'auto' }}>
			<div
				style={{ width: virtualizer.getTotalSize() + 'px', position: 'relative', height: '50px' }}
			>
				@for (const item of virtualizer.getVirtualItems(); key item.key) {
					<div
						class="hcol"
						data-index={item.index}
						style={{
							position: 'absolute',
							top: '0px',
							left: '0px',
							height: '100%',
							width: item.size + 'px',
							transform: 'translateX(' + item.start + 'px)',
						}}
					>
						{'Col ' + item.index}
					</div>
				}
			</div>
		</div>
	</div>
}
