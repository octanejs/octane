import { useRef, useState } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

// Self-contained differential fixture: the SAME source runs on octane (via
// @octanejs/tanstack-virtual) AND on React (the setup rewrites the import to
// real `@tanstack/react-virtual`), asserting byte-identical innerHTML.
// Invariants: keys = item.key; styles built ONLY from item.start /
// getTotalSize() (same core both sides); isScrolling is never rendered
// (isScrollingResetDelay kept small so its reset notify settles inside steps).
const RECT = { width: 100, height: 200 };
const SIZE_20 = () => 20;
const OBSERVE_RECT = (_instance: any, cb: (rect: typeof RECT) => void) => {
	cb(RECT);
	return () => {};
};

export function BasicList() @{
	const scrollRef = useRef(null as any);
	const [count, setCount] = useState(100);
	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_20,
		overscan: 2,
		isScrollingResetDelay: 10,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
	});
	<div>
		<button
			id="scroll-100"
			onClick={() => {
				scrollRef.current.scrollTop = 100;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			s100
		</button>
		<button
			id="scroll-500"
			onClick={() => {
				scrollRef.current.scrollTop = 500;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			s500
		</button>
		<button
			id="scroll-0"
			onClick={() => {
				scrollRef.current.scrollTop = 0;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			s0
		</button>
		<button id="count-swap" onClick={() => setCount(count === 30 ? 100 : 30)}>swap</button>
		<button id="to-idx-40" onClick={() => virtualizer.scrollToIndex(40)}>i40</button>
		<div id="scroller" ref={scrollRef} style={{ height: '200px', overflow: 'auto' }}>
			<div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
				@for (const item of virtualizer.getVirtualItems(); key item.key) {
					<div
						class="row"
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
	</div>
}
