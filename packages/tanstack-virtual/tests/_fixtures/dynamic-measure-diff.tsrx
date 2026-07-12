import { useRef } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

// Differential fixture: dynamic measurement through the PUBLIC measureElement
// option (data-size derived — no rect mocks; byte-identical on both sides) +
// ref={virtualizer.measureElement} feeding the elementsCache. Scrolling uses
// scrollToOffset (programmatic → core measures newly revealed items at ref
// time; a natural scroll would defer to the no-op RO identically on both
// sides, hiding the measurements this fixture exists to compare).
const RECT = { width: 100, height: 200 };
const SIZE_20 = () => 20;
const OBSERVE_RECT = (_instance: any, cb: (rect: typeof RECT) => void) => {
	cb(RECT);
	return () => {};
};
const MEASURE_DATA_SIZE = (el: Element) => Number(el.getAttribute('data-size'));

export function DynamicList() @{
	const scrollRef = useRef(null as any);
	const virtualizer = useVirtualizer({
		count: 60,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_20,
		isScrollingResetDelay: 10,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
		measureElement: MEASURE_DATA_SIZE,
	});
	<div>
		<button id="resize-3" onClick={() => virtualizer.resizeItem(3, 100)}>r3</button>
		<button id="resize-3-back" onClick={() => virtualizer.resizeItem(3, 30)}>r3b</button>
		<button id="measure-all" onClick={() => virtualizer.measure()}>m</button>
		<button id="scroll-200" onClick={() => virtualizer.scrollToOffset(200)}>s200</button>
		<div id="dscroller" ref={scrollRef} style={{ height: '200px', overflow: 'auto' }}>
			<div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
				@for (const item of virtualizer.getVirtualItems(); key item.key) {
					<div
						class="drow"
						data-index={item.index}
						data-size={20 + (item.index % 3) * 10}
						ref={virtualizer.measureElement}
						style={{
							position: 'absolute',
							top: '0px',
							left: '0px',
							width: '100%',
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
