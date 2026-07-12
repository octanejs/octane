import { useRef } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

// Dynamic-measurement fixtures. The primary list drives sizes through the
// PUBLIC `measureElement` option reading each item's data-size attribute
// (upstream's own test technique — no rect mocks); `ref={virtualizer.measureElement}`
// feeds the elementsCache exactly as consumers wire it. The default list
// leaves `measureElement` unset so a per-test getBoundingClientRect prototype
// swap can cover the default codepath.

export const renders = { direct: 0 };
export const captured: { instance?: any } = {};

const RECT = { width: 200, height: 200 };
const OBSERVE_RECT = (_instance: any, cb: (rect: typeof RECT) => void) => {
	cb(RECT);
	return () => {};
};
const SIZE_20 = () => 20;
const SIZE_50 = () => 50;
const MEASURE_DATA_SIZE = (el: Element) => Number(el.getAttribute('data-size'));
const MEASURE_50 = () => 50;

export function DynamicList() @{
	const scrollRef = useRef(null as any);
	const virtualizer = useVirtualizer({
		count: 50,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_20,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
		measureElement: MEASURE_DATA_SIZE,
	});
	captured.instance = virtualizer;
	<div>
		<button id="resize-3" onClick={() => virtualizer.resizeItem(3, 100)}>r3</button>
		<button id="measure-all" onClick={() => virtualizer.measure()}>m</button>
		<button
			id="scroll-200"
			onClick={() => {
				// Programmatic scroll (via the jsdom scrollTo shim): core sets
				// scrollState, so newly revealed items measure IMMEDIATELY at ref
				// time. A natural scroll defers measurement while isScrolling and
				// relies on ResizeObserver to land it afterwards — inert under the
				// test suite's no-op RO stub (identically so on React in jsdom).
				virtualizer.scrollToOffset(200);
			}}
		>
			s200
		</button>
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

// Default-measureElement codepath: NO measureElement option — the per-test
// getBoundingClientRect prototype swap supplies the sizes.
export function DefaultMeasureList() @{
	const scrollRef = useRef(null as any);
	const virtualizer = useVirtualizer({
		count: 50,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_20,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
	});
	captured.instance = virtualizer;
	<div id="mscroller" ref={scrollRef} style={{ height: '200px', overflow: 'auto' }}>
		<div style={{ height: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
			@for (const item of virtualizer.getVirtualItems(); key item.key) {
				<div
					class="mrow"
					data-index={item.index}
					ref={virtualizer.measureElement}
					style={{
						position: 'absolute',
						top: '0px',
						transform: 'translateY(' + item.start + 'px)',
					}}
				>
					{'Row ' + item.index}
				</div>
			}
		</div>
	</div>
}

// directDomUpdates: the virtualizer writes item transforms + the container
// size straight to the DOM and only re-renders on range/isScrolling changes.
export function DirectList() @{
	renders.direct++;
	const scrollRef = useRef(null as any);
	const virtualizer = useVirtualizer({
		count: 50,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_50,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
		measureElement: MEASURE_50,
		directDomUpdates: true,
	});
	captured.instance = virtualizer;
	<div>
		<button
			id="dd-scroll-30"
			onClick={() => {
				scrollRef.current.scrollTop = 30;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			dd30
		</button>
		<button
			id="dd-scroll-40"
			onClick={() => {
				scrollRef.current.scrollTop = 40;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			dd40
		</button>
		<button
			id="dd-scroll-500"
			onClick={() => {
				scrollRef.current.scrollTop = 500;
				scrollRef.current.dispatchEvent(new Event('scroll'));
			}}
		>
			dd500
		</button>
		<div id="ddscroller" ref={scrollRef} style={{ height: '200px', overflow: 'auto' }}>
			<div id="dd-sizer" ref={virtualizer.containerRef} style={{ position: 'relative' }}>
				@for (const item of virtualizer.getVirtualItems(); key item.key) {
					<div
						class="ddrow"
						data-index={item.index}
						ref={virtualizer.measureElement}
						style={{ position: 'absolute', top: '0px', left: '0px', width: '100%' }}
					>
						{'Row ' + item.index}
					</div>
				}
			</div>
		</div>
	</div>
}
