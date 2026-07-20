import { useRef, useState } from 'octane';
import { useVirtualizer } from '@octanejs/tanstack-virtual';

// Core-wiring fixture. Option FUNCTIONS are module-level (stable references)
// so re-renders don't dirty virtual-core's memo keys. Rect data comes from
// `initialRect` + a custom `observeElementRect` (jsdom offsetWidth/offsetHeight
// are 0 — the default observer would clobber initialRect with a 0×0 rect);
// the captured cb lets tests drive viewport resizes.

export const renders = { list: 0 };
export const captured: {
	instance?: any;
	rectCb?: (rect: { width: number; height: number }) => void;
	onChangeArgs: Array<{ sync: boolean }>;
	scrollEl?: any;
} = { onChangeArgs: [] };

const RECT = { width: 200, height: 200 };
const SIZE_50 = () => 50;
const OBSERVE_RECT = (_instance: any, cb: (rect: typeof RECT) => void) => {
	captured.rectCb = cb;
	cb(RECT);
	return () => {};
};
const ON_CHANGE = (_instance: any, sync: boolean) => {
	captured.onChangeArgs.push({ sync });
};

export function BasicList(props: {
	count?: number;
	overscan?: number;
	rangeExtractor?: any;
	isScrollingResetDelay?: number;
}) @{
	renders.list++;
	const scrollRef = useRef(null as any);
	const [count, setCount] = useState(props.count ?? 200);
	const [bump, setBump] = useState(0);
	const virtualizer = useVirtualizer({
		count,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_50,
		overscan: props.overscan,
		rangeExtractor: props.rangeExtractor,
		isScrollingResetDelay: props.isScrollingResetDelay,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
		onChange: ON_CHANGE,
	});
	captured.instance = virtualizer;
	captured.scrollEl = scrollRef;
	<div>
		<button id="bump" onClick={() => setBump(bump + 1)}>{'b' + bump}</button>
		<button id="count-swap" onClick={() => setCount(count === 10 ? 200 : 10)}>swap</button>
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

// Horizontal smoke: width-major rect, scrollLeft driving, translateX rows.
export function HorizontalList() @{
	const scrollRef = useRef(null as any);
	const virtualizer = useVirtualizer({
		count: 100,
		getScrollElement: () => scrollRef.current,
		estimateSize: SIZE_50,
		horizontal: true,
		initialRect: RECT,
		observeElementRect: OBSERVE_RECT,
	});
	captured.instance = virtualizer;
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
		<div id="hscroller" ref={scrollRef} style={{ width: '200px', overflow: 'auto' }}>
			<div style={{ width: virtualizer.getTotalSize() + 'px', position: 'relative' }}>
				@for (const item of virtualizer.getVirtualItems(); key item.key) {
					<div
						class="hcol"
						data-index={item.index}
						style={{
							position: 'absolute',
							top: '0px',
							left: '0px',
							height: '100%',
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
