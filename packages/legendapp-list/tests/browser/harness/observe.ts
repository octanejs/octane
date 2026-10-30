import { harness } from './bridge.ts';

// One settled observation of the list: scroll geometry, the rows that are mounted
// with their content-relative positions, the order they appear in the DOM, the
// list's own getState() and the callback log.
export function snapshot() {
	const list = harness.ref.current;
	const scroller = list?.getScrollableNode?.() as HTMLElement | undefined;
	if (!list || !scroller) {
		return { mounted: false, log: harness.log };
	}
	const box = scroller.getBoundingClientRect();
	const horizontal =
		scroller.scrollWidth > scroller.clientWidth && scroller.scrollHeight <= scroller.clientHeight;
	const state = list.getState();
	// Rows outside the buffered window are idle pool containers whose last item depends
	// on render timing; the window itself is compared through getState().
	const inWindow = (id: string) => {
		const index = state.indexByKey(id);
		return index !== undefined && index >= state.startBuffered && index <= state.endBuffered;
	};
	const mountedRows = [...scroller.querySelectorAll<HTMLElement>('[data-row]')];
	// A row whose item left the data must not survive in the DOM.
	const strayRows = mountedRows
		.map((element) => element.dataset.row!)
		.filter((id) => state.indexByKey(id) === undefined);
	const placed = mountedRows
		.filter((element) => inWindow(element.dataset.row!))
		.map((element) => {
			const rect = element.getBoundingClientRect();
			return {
				id: element.dataset.row!,
				offset: Math.round(
					horizontal
						? rect.left - box.left + scroller.scrollLeft
						: rect.top - box.top + scroller.scrollTop,
				),
				size: Math.round(horizontal ? rect.width : rect.height),
				text: element.textContent,
			};
		});
	const rendered: Record<string, { position: number; size: number }> = {};
	for (let index = Math.max(0, state.startBuffered); index <= state.endBuffered; index++) {
		rendered[index] = {
			position: Math.round(state.positionAtIndex(index)),
			size: Math.round(state.sizeAtIndex(index)),
		};
	}
	return {
		mounted: true,
		scrollTop: Math.round(scroller.scrollTop),
		scrollLeft: Math.round(scroller.scrollLeft),
		scrollHeight: scroller.scrollHeight,
		scrollWidth: scroller.scrollWidth,
		clientHeight: scroller.clientHeight,
		rows: [...placed].sort((a, b) => a.id.localeCompare(b.id)),
		domOrder: placed.map((row) => row.id),
		strayRows,
		snapAnchors: [...scroller.querySelectorAll<HTMLElement>('[data-legend-list-snap-anchor]')].map(
			(anchor) => anchor.dataset.legendListSnapAnchor,
		),
		state: {
			contentLength: Math.round(state.contentLength),
			dataLength: state.data.length,
			end: state.end,
			endBuffered: state.endBuffered,
			isAtEnd: state.isAtEnd,
			isAtStart: state.isAtStart,
			isEndReached: state.isEndReached,
			isNearEnd: state.isNearEnd,
			isNearStart: state.isNearStart,
			isStartReached: state.isStartReached,
			rendered,
			scroll: Math.round(state.scroll),
			scrollLength: Math.round(state.scrollLength),
			start: state.start,
			startBuffered: state.startBuffered,
		},
		log: harness.log,
	};
}
