// Ported from @radix-ui/react-scroll-area (source:
// .radix-primitives/packages/react/scroll-area/src/scroll-area.tsx +
// use-state-machine.ts). Custom cross-browser scrollbars over a native scroll
// viewport (native bars hidden via an injected style; `display: table` content
// wrapper so scroll size is measurable). Scrollbar visibility strategies: `hover`
// (pointer enter/leave + hide delay), `scroll` (a hidden→scrolling→idle state
// machine driven by scroll events), `auto` (overflow measurement), `always`.
// Thumb geometry is pure math (linearScale) over {content, viewport, scrollbar}
// sizes reported by ResizeObserver; thumb position updates ride an UNLINKED
// requestAnimationFrame loop while scrolling (scroll-linked-effect avoidance,
// verbatim from the source). ResizeObserver use is jsdom-guarded like use-size.ts.
import {
	createElement,
	useCallback,
	useEffect,
	useLayoutEffect,
	useReducer,
	useRef,
	useState,
} from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { S, subSlot } from './internal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { useCallbackRef } from './use-callback-ref';

type Direction = 'ltr' | 'rtl';
interface Sizes {
	content: number;
	viewport: number;
	scrollbar: {
		size: number;
		paddingStart: number;
		paddingEnd: number;
	};
}

const SCROLL_AREA_NAME = 'ScrollArea';

const [createScrollAreaContext, createScrollAreaScope] = createContextScope(SCROLL_AREA_NAME);
export { createScrollAreaScope };

interface ScrollAreaContextValue {
	type: 'auto' | 'always' | 'scroll' | 'hover';
	dir: Direction;
	scrollHideDelay: number;
	scrollArea: HTMLElement | null;
	viewport: HTMLElement | null;
	onViewportChange(viewport: HTMLElement | null): void;
	content: HTMLDivElement | null;
	onContentChange(content: HTMLDivElement): void;
	scrollbarX: HTMLElement | null;
	onScrollbarXChange(scrollbar: HTMLElement | null): void;
	scrollbarXEnabled: boolean;
	onScrollbarXEnabledChange(rendered: boolean): void;
	scrollbarY: HTMLElement | null;
	onScrollbarYChange(scrollbar: HTMLElement | null): void;
	scrollbarYEnabled: boolean;
	onScrollbarYEnabledChange(rendered: boolean): void;
	onCornerWidthChange(width: number): void;
	onCornerHeightChange(height: number): void;
}

const [ScrollAreaProvider, useScrollAreaContext] =
	createScrollAreaContext<ScrollAreaContextValue>(SCROLL_AREA_NAME);

export function Root(props: any): any {
	const slot = S('ScrollArea.Root');
	const {
		__scopeScrollArea,
		type = 'hover',
		dir,
		scrollHideDelay = 600,
		ref: forwardedRef,
		...scrollAreaProps
	} = props ?? {};
	const [scrollArea, setScrollArea] = useState<HTMLElement | null>(null, subSlot(slot, 'area'));
	const [viewport, setViewport] = useState<HTMLElement | null>(null, subSlot(slot, 'viewport'));
	const [content, setContent] = useState<HTMLDivElement | null>(null, subSlot(slot, 'content'));
	const [scrollbarX, setScrollbarX] = useState<HTMLElement | null>(null, subSlot(slot, 'sbx'));
	const [scrollbarY, setScrollbarY] = useState<HTMLElement | null>(null, subSlot(slot, 'sby'));
	const [cornerWidth, setCornerWidth] = useState(0, subSlot(slot, 'cw'));
	const [cornerHeight, setCornerHeight] = useState(0, subSlot(slot, 'ch'));
	const [scrollbarXEnabled, setScrollbarXEnabled] = useState(false, subSlot(slot, 'sbxOn'));
	const [scrollbarYEnabled, setScrollbarYEnabled] = useState(false, subSlot(slot, 'sbyOn'));
	const composedRefs = useComposedRefs(forwardedRef, setScrollArea, subSlot(slot, 'refs'));
	const direction = useDirection(dir);

	return createElement(ScrollAreaProvider, {
		scope: __scopeScrollArea,
		type,
		dir: direction,
		scrollHideDelay,
		scrollArea,
		viewport,
		onViewportChange: setViewport,
		content,
		onContentChange: setContent,
		scrollbarX,
		onScrollbarXChange: setScrollbarX,
		scrollbarXEnabled,
		onScrollbarXEnabledChange: setScrollbarXEnabled,
		scrollbarY,
		onScrollbarYChange: setScrollbarY,
		scrollbarYEnabled,
		onScrollbarYEnabledChange: setScrollbarYEnabled,
		onCornerWidthChange: setCornerWidth,
		onCornerHeightChange: setCornerHeight,
		children: createElement(Primitive.div, {
			dir: direction,
			...scrollAreaProps,
			ref: composedRefs,
			style: {
				position: 'relative',
				// Pass corner sizes as CSS vars to reduce re-renders of context consumers
				'--radix-scroll-area-corner-width': cornerWidth + 'px',
				'--radix-scroll-area-corner-height': cornerHeight + 'px',
				...props?.style,
			},
		}),
	});
}

// Hide scrollbars cross-browser and enable momentum scroll for touch devices.
function ViewportStyle(props: { nonce?: string }): any {
	return createElement('style', {
		dangerouslySetInnerHTML: {
			__html: `[data-radix-scroll-area-viewport]{scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;}[data-radix-scroll-area-viewport]::-webkit-scrollbar{display:none}`,
		},
		nonce: props.nonce,
	});
}

export function Viewport(props: any): any {
	const slot = S('ScrollArea.Viewport');
	const { __scopeScrollArea, children, nonce, ref: forwardedRef, ...viewportProps } = props ?? {};
	const context = useScrollAreaContext('ScrollAreaViewport', __scopeScrollArea);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		ref,
		context.onViewportChange,
		subSlot(slot, 'refs'),
	);
	return [
		createElement(ViewportStyle, { key: 'style', nonce }),
		createElement(Primitive.div, {
			key: 'viewport',
			'data-radix-scroll-area-viewport': '',
			...viewportProps,
			ref: composedRefs,
			style: {
				// `visible` is unsupported and `auto` would show native bars — force `scroll`
				// and hide the native scrollbars with the injected style (see the source's
				// rationale comment).
				overflowX: context.scrollbarXEnabled ? 'scroll' : 'hidden',
				overflowY: context.scrollbarYEnabled ? 'scroll' : 'hidden',
				...props?.style,
			},
			// `display: table` ensures the content div matches the size of its children in
			// both axes so scroll width/height changes are measurable for thumb sizing.
			children: createElement('div', {
				ref: context.onContentChange,
				style: { minWidth: '100%', display: 'table' },
				children,
			}),
		}),
	];
}

const SCROLLBAR_NAME = 'ScrollAreaScrollbar';

export function Scrollbar(props: any): any {
	const slot = S('ScrollArea.Scrollbar');
	const { forceMount, ...scrollbarProps } = props ?? {};
	const context = useScrollAreaContext(SCROLLBAR_NAME, props?.__scopeScrollArea);
	const { onScrollbarXEnabledChange, onScrollbarYEnabledChange } = context;
	const isHorizontal = props?.orientation === 'horizontal';

	useEffect(
		() => {
			isHorizontal ? onScrollbarXEnabledChange(true) : onScrollbarYEnabledChange(true);
			return () => {
				isHorizontal ? onScrollbarXEnabledChange(false) : onScrollbarYEnabledChange(false);
			};
		},
		[isHorizontal, onScrollbarXEnabledChange, onScrollbarYEnabledChange],
		subSlot(slot, 'e:enabled'),
	);

	return context.type === 'hover'
		? createElement(ScrollbarHover, { ...scrollbarProps, forceMount })
		: context.type === 'scroll'
			? createElement(ScrollbarScroll, { ...scrollbarProps, forceMount })
			: context.type === 'auto'
				? createElement(ScrollbarAuto, { ...scrollbarProps, forceMount })
				: context.type === 'always'
					? createElement(ScrollbarVisible, { ...scrollbarProps, 'data-state': 'visible' })
					: null;
}

function ScrollbarHover(props: any): any {
	const slot = S('ScrollArea.ScrollbarHover');
	const { forceMount, ...scrollbarProps } = props;
	const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
	const [visible, setVisible] = useState(false, subSlot(slot, 'visible'));

	useEffect(
		() => {
			const scrollArea = context.scrollArea;
			let hideTimer = 0;
			if (scrollArea) {
				const handlePointerEnter = (): void => {
					window.clearTimeout(hideTimer);
					setVisible(true);
				};
				const handlePointerLeave = (): void => {
					hideTimer = window.setTimeout(() => setVisible(false), context.scrollHideDelay);
				};
				scrollArea.addEventListener('pointerenter', handlePointerEnter);
				scrollArea.addEventListener('pointerleave', handlePointerLeave);
				return () => {
					window.clearTimeout(hideTimer);
					scrollArea.removeEventListener('pointerenter', handlePointerEnter);
					scrollArea.removeEventListener('pointerleave', handlePointerLeave);
				};
			}
		},
		[context.scrollArea, context.scrollHideDelay],
		subSlot(slot, 'e:hover'),
	);

	return createElement(Presence, {
		present: forceMount || visible,
		children: createElement(ScrollbarAuto, {
			'data-state': visible ? 'visible' : 'hidden',
			...scrollbarProps,
		}),
	});
}

// use-state-machine.ts, inlined: a reducer over a {state: {event: nextState}} table.
function useStateMachine(
	initialState: string,
	machine: Record<string, Record<string, string>>,
	slot: symbol | undefined,
): [string, (event: string) => void] {
	const [state, dispatch] = useReducer(
		(state: string, event: string): string => {
			const nextState = machine[state][event];
			return nextState ?? state;
		},
		initialState,
		slot,
	);
	return [state, dispatch];
}

function ScrollbarScroll(props: any): any {
	const slot = S('ScrollArea.ScrollbarScroll');
	const { forceMount, ...scrollbarProps } = props;
	const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
	const isHorizontal = props.orientation === 'horizontal';
	const debounceScrollEnd = useDebounceCallback(
		() => send('SCROLL_END'),
		100,
		subSlot(slot, 'debounce'),
	);
	const [state, send] = useStateMachine(
		'hidden',
		{
			hidden: {
				SCROLL: 'scrolling',
			},
			scrolling: {
				SCROLL_END: 'idle',
				POINTER_ENTER: 'interacting',
			},
			interacting: {
				SCROLL: 'interacting',
				POINTER_LEAVE: 'idle',
			},
			idle: {
				HIDE: 'hidden',
				SCROLL: 'scrolling',
				POINTER_ENTER: 'interacting',
			},
		},
		subSlot(slot, 'machine'),
	);

	useEffect(
		() => {
			if (state === 'idle') {
				const hideTimer = window.setTimeout(() => send('HIDE'), context.scrollHideDelay);
				return () => window.clearTimeout(hideTimer);
			}
		},
		[state, context.scrollHideDelay, send],
		subSlot(slot, 'e:hide'),
	);

	useEffect(
		() => {
			const viewport = context.viewport;
			const scrollDirection = isHorizontal ? 'scrollLeft' : 'scrollTop';

			if (viewport) {
				let prevScrollPos = (viewport as any)[scrollDirection];
				const handleScroll = (): void => {
					const scrollPos = (viewport as any)[scrollDirection];
					const hasScrollInDirectionChanged = prevScrollPos !== scrollPos;
					if (hasScrollInDirectionChanged) {
						send('SCROLL');
						debounceScrollEnd();
					}
					prevScrollPos = scrollPos;
				};
				viewport.addEventListener('scroll', handleScroll);
				return () => viewport.removeEventListener('scroll', handleScroll);
			}
		},
		[context.viewport, isHorizontal, send, debounceScrollEnd],
		subSlot(slot, 'e:scroll'),
	);

	return createElement(Presence, {
		present: forceMount || state !== 'hidden',
		children: createElement(ScrollbarVisible, {
			'data-state': state === 'hidden' ? 'hidden' : 'visible',
			...scrollbarProps,
			onPointerEnter: composeEventHandlers(props.onPointerEnter, () => send('POINTER_ENTER')),
			onPointerLeave: composeEventHandlers(props.onPointerLeave, () => send('POINTER_LEAVE')),
		}),
	});
}

function ScrollbarAuto(props: any): any {
	const slot = S('ScrollArea.ScrollbarAuto');
	const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
	const { forceMount, ...scrollbarProps } = props;
	const [visible, setVisible] = useState(false, subSlot(slot, 'visible'));
	const isHorizontal = props.orientation === 'horizontal';
	const handleResize = useDebounceCallback(
		() => {
			if (context.viewport) {
				const isOverflowX = context.viewport.offsetWidth < context.viewport.scrollWidth;
				const isOverflowY = context.viewport.offsetHeight < context.viewport.scrollHeight;
				setVisible(isHorizontal ? isOverflowX : isOverflowY);
			}
		},
		10,
		subSlot(slot, 'debounce'),
	);

	useResizeObserver(context.viewport, handleResize, subSlot(slot, 'ro:viewport'));
	useResizeObserver(context.content, handleResize, subSlot(slot, 'ro:content'));

	return createElement(Presence, {
		present: forceMount || visible,
		children: createElement(ScrollbarVisible, {
			'data-state': visible ? 'visible' : 'hidden',
			...scrollbarProps,
		}),
	});
}

function ScrollbarVisible(props: any): any {
	const slot = S('ScrollArea.ScrollbarVisible');
	const { orientation = 'vertical', ref: forwardedRef, ...scrollbarProps } = props;
	const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
	const thumbRef = useRef<HTMLElement | null>(null, subSlot(slot, 'thumb'));
	const pointerOffsetRef = useRef(0, subSlot(slot, 'offset'));
	const [sizes, setSizes] = useState<Sizes>(
		{
			content: 0,
			viewport: 0,
			scrollbar: { size: 0, paddingStart: 0, paddingEnd: 0 },
		},
		subSlot(slot, 'sizes'),
	);
	const thumbRatio = getThumbRatio(sizes.viewport, sizes.content);

	const commonProps = {
		...scrollbarProps,
		sizes,
		onSizesChange: setSizes,
		hasThumb: Boolean(thumbRatio > 0 && thumbRatio < 1),
		onThumbChange: (thumb: HTMLElement | null) => (thumbRef.current = thumb),
		onThumbPointerUp: () => (pointerOffsetRef.current = 0),
		onThumbPointerDown: (pointerPos: number) => (pointerOffsetRef.current = pointerPos),
	};

	function getScrollPosition(pointerPos: number, dir?: Direction): number {
		return getScrollPositionFromPointer(pointerPos, pointerOffsetRef.current, sizes, dir);
	}

	if (orientation === 'horizontal') {
		return createElement(ScrollbarX, {
			...commonProps,
			ref: forwardedRef,
			onThumbPositionChange: () => {
				if (context.viewport && thumbRef.current) {
					const scrollPos = context.viewport.scrollLeft;
					const offset = getThumbOffsetFromScroll(scrollPos, sizes, context.dir);
					thumbRef.current.style.transform = `translate3d(${offset}px, 0, 0)`;
				}
			},
			onWheelScroll: (scrollPos: number) => {
				if (context.viewport) context.viewport.scrollLeft = scrollPos;
			},
			onDragScroll: (pointerPos: number) => {
				if (context.viewport) {
					context.viewport.scrollLeft = getScrollPosition(pointerPos, context.dir);
				}
			},
		});
	}

	if (orientation === 'vertical') {
		return createElement(ScrollbarY, {
			...commonProps,
			ref: forwardedRef,
			onThumbPositionChange: () => {
				if (context.viewport && thumbRef.current) {
					const scrollPos = context.viewport.scrollTop;
					const offset = getThumbOffsetFromScroll(scrollPos, sizes);
					thumbRef.current.style.transform = `translate3d(0, ${offset}px, 0)`;
				}
			},
			onWheelScroll: (scrollPos: number) => {
				if (context.viewport) context.viewport.scrollTop = scrollPos;
			},
			onDragScroll: (pointerPos: number) => {
				if (context.viewport) context.viewport.scrollTop = getScrollPosition(pointerPos);
			},
		});
	}

	return null;
}

function ScrollbarX(props: any): any {
	const slot = S('ScrollArea.ScrollbarX');
	const { sizes, onSizesChange, ref: forwardedRef, ...scrollbarProps } = props;
	const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
	const [computedStyle, setComputedStyle] = useState<CSSStyleDeclaration | undefined>(
		undefined,
		subSlot(slot, 'style'),
	);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composeRefs = useComposedRefs(
		forwardedRef,
		ref,
		context.onScrollbarXChange,
		subSlot(slot, 'refs'),
	);

	useEffect(
		() => {
			if (ref.current) setComputedStyle(getComputedStyle(ref.current));
		},
		[ref],
		subSlot(slot, 'e:style'),
	);

	return createElement(ScrollbarImpl, {
		'data-orientation': 'horizontal',
		...scrollbarProps,
		__scopeScrollArea: props.__scopeScrollArea,
		ref: composeRefs,
		sizes,
		style: {
			bottom: 0,
			left: context.dir === 'rtl' ? 'var(--radix-scroll-area-corner-width)' : 0,
			right: context.dir === 'ltr' ? 'var(--radix-scroll-area-corner-width)' : 0,
			'--radix-scroll-area-thumb-width': getThumbSize(sizes) + 'px',
			...props.style,
		},
		onThumbPointerDown: (pointerPos: { x: number; y: number }) =>
			props.onThumbPointerDown(pointerPos.x),
		onDragScroll: (pointerPos: { x: number; y: number }) => props.onDragScroll(pointerPos.x),
		onWheelScroll: (event: WheelEvent, maxScrollPos: number) => {
			if (context.viewport) {
				const scrollPos = context.viewport.scrollLeft + event.deltaX;
				props.onWheelScroll(scrollPos);
				// prevent window scroll when wheeling on scrollbar
				if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
					event.preventDefault();
				}
			}
		},
		onResize: () => {
			if (ref.current && context.viewport && computedStyle) {
				onSizesChange({
					content: context.viewport.scrollWidth,
					viewport: context.viewport.offsetWidth,
					scrollbar: {
						size: ref.current.clientWidth,
						paddingStart: toInt(computedStyle.paddingLeft),
						paddingEnd: toInt(computedStyle.paddingRight),
					},
				});
			}
		},
	});
}

function ScrollbarY(props: any): any {
	const slot = S('ScrollArea.ScrollbarY');
	const { sizes, onSizesChange, ref: forwardedRef, ...scrollbarProps } = props;
	const context = useScrollAreaContext(SCROLLBAR_NAME, props.__scopeScrollArea);
	const [computedStyle, setComputedStyle] = useState<CSSStyleDeclaration | undefined>(
		undefined,
		subSlot(slot, 'style'),
	);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composeRefs = useComposedRefs(
		forwardedRef,
		ref,
		context.onScrollbarYChange,
		subSlot(slot, 'refs'),
	);

	useEffect(
		() => {
			if (ref.current) setComputedStyle(getComputedStyle(ref.current));
		},
		[ref],
		subSlot(slot, 'e:style'),
	);

	return createElement(ScrollbarImpl, {
		'data-orientation': 'vertical',
		...scrollbarProps,
		__scopeScrollArea: props.__scopeScrollArea,
		ref: composeRefs,
		sizes,
		style: {
			top: 0,
			right: context.dir === 'ltr' ? 0 : undefined,
			left: context.dir === 'rtl' ? 0 : undefined,
			bottom: 'var(--radix-scroll-area-corner-height)',
			'--radix-scroll-area-thumb-height': getThumbSize(sizes) + 'px',
			...props.style,
		},
		onThumbPointerDown: (pointerPos: { x: number; y: number }) =>
			props.onThumbPointerDown(pointerPos.y),
		onDragScroll: (pointerPos: { x: number; y: number }) => props.onDragScroll(pointerPos.y),
		onWheelScroll: (event: WheelEvent, maxScrollPos: number) => {
			if (context.viewport) {
				const scrollPos = context.viewport.scrollTop + event.deltaY;
				props.onWheelScroll(scrollPos);
				// prevent window scroll when wheeling on scrollbar
				if (isScrollingWithinScrollbarBounds(scrollPos, maxScrollPos)) {
					event.preventDefault();
				}
			}
		},
		onResize: () => {
			if (ref.current && context.viewport && computedStyle) {
				onSizesChange({
					content: context.viewport.scrollHeight,
					viewport: context.viewport.offsetHeight,
					scrollbar: {
						size: ref.current.clientHeight,
						paddingStart: toInt(computedStyle.paddingTop),
						paddingEnd: toInt(computedStyle.paddingBottom),
					},
				});
			}
		},
	});
}

interface ScrollbarContext {
	hasThumb: boolean;
	scrollbar: HTMLElement | null;
	onThumbChange(thumb: HTMLElement | null): void;
	onThumbPointerUp(): void;
	onThumbPointerDown(pointerPos: { x: number; y: number }): void;
	onThumbPositionChange(): void;
}

const [ScrollbarProvider, useScrollbarContext] =
	createScrollAreaContext<ScrollbarContext>(SCROLLBAR_NAME);

function ScrollbarImpl(props: any): any {
	const slot = S('ScrollArea.ScrollbarImpl');
	const {
		__scopeScrollArea,
		sizes,
		hasThumb,
		onThumbChange,
		onThumbPointerUp,
		onThumbPointerDown,
		onThumbPositionChange,
		onDragScroll,
		onWheelScroll,
		onResize,
		ref: forwardedRef,
		...scrollbarProps
	} = props;
	const context = useScrollAreaContext(SCROLLBAR_NAME, __scopeScrollArea);
	const [scrollbar, setScrollbar] = useState<HTMLElement | null>(null, subSlot(slot, 'node'));
	const composeRefs = useComposedRefs(forwardedRef, setScrollbar, subSlot(slot, 'refs'));
	const rectRef = useRef<DOMRect | null>(null, subSlot(slot, 'rect'));
	const prevWebkitUserSelectRef = useRef<string>('', subSlot(slot, 'select'));
	const viewport = context.viewport;
	const maxScrollPos = sizes.content - sizes.viewport;
	const handleWheelScroll = useCallbackRef(onWheelScroll, subSlot(slot, 'wheel'));
	const handleThumbPositionChange = useCallbackRef(onThumbPositionChange, subSlot(slot, 'thumb'));
	const handleResize = useDebounceCallback(onResize, 10, subSlot(slot, 'resize'));

	function handleDragScroll(event: PointerEvent): void {
		if (rectRef.current) {
			const x = event.clientX - rectRef.current.left;
			const y = event.clientY - rectRef.current.top;
			onDragScroll({ x, y });
		}
	}

	// We bind the wheel event imperatively so we can switch off passive mode for the
	// document wheel event to allow it to be prevented.
	useEffect(
		() => {
			const handleWheel = (event: WheelEvent): void => {
				const element = event.target as HTMLElement;
				const isScrollbarWheel = scrollbar?.contains(element);
				if (isScrollbarWheel) handleWheelScroll(event, maxScrollPos);
			};
			document.addEventListener('wheel', handleWheel, { passive: false });
			return () => document.removeEventListener('wheel', handleWheel, { passive: false } as any);
		},
		[viewport, scrollbar, maxScrollPos, handleWheelScroll],
		subSlot(slot, 'e:wheel'),
	);

	// Update thumb position on sizes change.
	useEffect(handleThumbPositionChange, [sizes, handleThumbPositionChange], subSlot(slot, 'e:pos'));

	useResizeObserver(scrollbar, handleResize, subSlot(slot, 'ro:scrollbar'));
	useResizeObserver(context.content, handleResize, subSlot(slot, 'ro:content'));

	return createElement(ScrollbarProvider, {
		scope: __scopeScrollArea,
		scrollbar,
		hasThumb,
		onThumbChange: useCallbackRef(onThumbChange, subSlot(slot, 'cb:thumb')),
		onThumbPointerUp: useCallbackRef(onThumbPointerUp, subSlot(slot, 'cb:up')),
		onThumbPositionChange: handleThumbPositionChange,
		onThumbPointerDown: useCallbackRef(onThumbPointerDown, subSlot(slot, 'cb:down')),
		children: createElement(Primitive.div, {
			...scrollbarProps,
			ref: composeRefs,
			style: { position: 'absolute', ...scrollbarProps.style },
			onPointerDown: composeEventHandlers(props.onPointerDown, (event: PointerEvent) => {
				const mainPointer = 0;
				if (event.button === mainPointer) {
					const element = event.target as HTMLElement;
					element.setPointerCapture(event.pointerId);
					rectRef.current = scrollbar!.getBoundingClientRect();
					// pointer capture doesn't prevent text selection in Safari
					// so we remove text selection manually when scrolling
					prevWebkitUserSelectRef.current = (document.body.style as any).webkitUserSelect;
					(document.body.style as any).webkitUserSelect = 'none';
					if (context.viewport) context.viewport.style.scrollBehavior = 'auto';
					handleDragScroll(event);
				}
			}),
			onPointerMove: composeEventHandlers(props.onPointerMove, handleDragScroll),
			onPointerUp: composeEventHandlers(props.onPointerUp, (event: PointerEvent) => {
				const element = event.target as HTMLElement;
				if (element.hasPointerCapture(event.pointerId)) {
					element.releasePointerCapture(event.pointerId);
				}
				(document.body.style as any).webkitUserSelect = prevWebkitUserSelectRef.current;
				if (context.viewport) context.viewport.style.scrollBehavior = '';
				rectRef.current = null;
			}),
		}),
	});
}

const THUMB_NAME = 'ScrollAreaThumb';

export function Thumb(props: any): any {
	const { forceMount, ...thumbProps } = props ?? {};
	const scrollbarContext = useScrollbarContext(THUMB_NAME, props?.__scopeScrollArea);
	return createElement(Presence, {
		present: forceMount || scrollbarContext.hasThumb,
		children: createElement(ThumbImpl, thumbProps),
	});
}

function ThumbImpl(props: any): any {
	const slot = S('ScrollArea.ThumbImpl');
	const { __scopeScrollArea, style, ref: forwardedRef, ...thumbProps } = props;
	const scrollAreaContext = useScrollAreaContext(THUMB_NAME, __scopeScrollArea);
	const scrollbarContext = useScrollbarContext(THUMB_NAME, __scopeScrollArea);
	const { onThumbPositionChange } = scrollbarContext;
	const composedRef = useComposedRefs(
		forwardedRef,
		scrollbarContext.onThumbChange,
		subSlot(slot, 'refs'),
	);
	const removeUnlinkedScrollListenerRef = useRef<(() => void) | undefined>(
		undefined,
		subSlot(slot, 'unlinked'),
	);
	const debounceScrollEnd = useDebounceCallback(
		() => {
			if (removeUnlinkedScrollListenerRef.current) {
				removeUnlinkedScrollListenerRef.current();
				removeUnlinkedScrollListenerRef.current = undefined;
			}
		},
		100,
		subSlot(slot, 'debounce'),
	);

	useEffect(
		() => {
			const viewport = scrollAreaContext.viewport;
			if (viewport) {
				// We only bind to the native scroll event so we know when scroll starts and
				// ends. When scroll starts we start a requestAnimationFrame loop that checks
				// for changes to scroll position — that rAF loop triggers our thumb position
				// change when relevant (scroll-linked-effect avoidance). We cancel the loop
				// when scroll ends.
				const handleScroll = (): void => {
					debounceScrollEnd();
					if (!removeUnlinkedScrollListenerRef.current) {
						const listener = addUnlinkedScrollListener(viewport, onThumbPositionChange);
						removeUnlinkedScrollListenerRef.current = listener;
						onThumbPositionChange();
					}
				};
				onThumbPositionChange();
				viewport.addEventListener('scroll', handleScroll);
				return () => viewport.removeEventListener('scroll', handleScroll);
			}
		},
		[scrollAreaContext.viewport, debounceScrollEnd, onThumbPositionChange],
		subSlot(slot, 'e:scroll'),
	);

	return createElement(Primitive.div, {
		'data-state': scrollbarContext.hasThumb ? 'visible' : 'hidden',
		...thumbProps,
		ref: composedRef,
		style: {
			width: 'var(--radix-scroll-area-thumb-width)',
			height: 'var(--radix-scroll-area-thumb-height)',
			...style,
		},
		onPointerDownCapture: composeEventHandlers(
			props.onPointerDownCapture,
			(event: PointerEvent) => {
				const thumb = event.target as HTMLElement;
				const thumbRect = thumb.getBoundingClientRect();
				const x = event.clientX - thumbRect.left;
				const y = event.clientY - thumbRect.top;
				scrollbarContext.onThumbPointerDown({ x, y });
			},
		),
		onPointerUp: composeEventHandlers(props.onPointerUp, scrollbarContext.onThumbPointerUp),
	});
}

const CORNER_NAME = 'ScrollAreaCorner';

export function Corner(props: any): any {
	const context = useScrollAreaContext(CORNER_NAME, props?.__scopeScrollArea);
	const hasBothScrollbarsVisible = Boolean(context.scrollbarX && context.scrollbarY);
	const hasCorner = context.type !== 'scroll' && hasBothScrollbarsVisible;
	return hasCorner ? createElement(CornerImpl, props) : null;
}

function CornerImpl(props: any): any {
	const slot = S('ScrollArea.CornerImpl');
	const { __scopeScrollArea, ...cornerProps } = props;
	const context = useScrollAreaContext(CORNER_NAME, __scopeScrollArea);
	const [width, setWidth] = useState(0, subSlot(slot, 'w'));
	const [height, setHeight] = useState(0, subSlot(slot, 'h'));
	const hasSize = Boolean(width && height);

	useResizeObserver(
		context.scrollbarX,
		() => {
			const height = context.scrollbarX?.offsetHeight || 0;
			context.onCornerHeightChange(height);
			setHeight(height);
		},
		subSlot(slot, 'ro:x'),
	);

	useResizeObserver(
		context.scrollbarY,
		() => {
			const width = context.scrollbarY?.offsetWidth || 0;
			context.onCornerWidthChange(width);
			setWidth(width);
		},
		subSlot(slot, 'ro:y'),
	);

	return hasSize
		? createElement(Primitive.div, {
				...cornerProps,
				style: {
					width,
					height,
					position: 'absolute',
					right: context.dir === 'ltr' ? 0 : undefined,
					left: context.dir === 'rtl' ? 0 : undefined,
					bottom: 0,
					...props.style,
				},
			})
		: null;
}

function toInt(value?: string): number {
	return value ? parseInt(value, 10) : 0;
}

function getThumbRatio(viewportSize: number, contentSize: number): number {
	const ratio = viewportSize / contentSize;
	return isNaN(ratio) ? 0 : ratio;
}

function getThumbSize(sizes: Sizes): number {
	const ratio = getThumbRatio(sizes.viewport, sizes.content);
	const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
	const thumbSize = (sizes.scrollbar.size - scrollbarPadding) * ratio;
	// minimum of 18 matches macOS minimum
	return Math.max(thumbSize, 18);
}

function getScrollPositionFromPointer(
	pointerPos: number,
	pointerOffset: number,
	sizes: Sizes,
	dir: Direction = 'ltr',
): number {
	const thumbSizePx = getThumbSize(sizes);
	const thumbCenter = thumbSizePx / 2;
	const offset = pointerOffset || thumbCenter;
	const thumbOffsetFromEnd = thumbSizePx - offset;
	const minPointerPos = sizes.scrollbar.paddingStart + offset;
	const maxPointerPos = sizes.scrollbar.size - sizes.scrollbar.paddingEnd - thumbOffsetFromEnd;
	const maxScrollPos = sizes.content - sizes.viewport;
	const scrollRange = dir === 'ltr' ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
	const interpolate = linearScale([minPointerPos, maxPointerPos], scrollRange as [number, number]);
	return interpolate(pointerPos);
}

function getThumbOffsetFromScroll(scrollPos: number, sizes: Sizes, dir: Direction = 'ltr'): number {
	const thumbSizePx = getThumbSize(sizes);
	const scrollbarPadding = sizes.scrollbar.paddingStart + sizes.scrollbar.paddingEnd;
	const scrollbar = sizes.scrollbar.size - scrollbarPadding;
	const maxScrollPos = sizes.content - sizes.viewport;
	const maxThumbPos = scrollbar - thumbSizePx;
	const scrollClampRange = dir === 'ltr' ? [0, maxScrollPos] : [maxScrollPos * -1, 0];
	const scrollWithoutMomentum = clamp(scrollPos, scrollClampRange as [number, number]);
	const interpolate = linearScale([0, maxScrollPos], [0, maxThumbPos]);
	return interpolate(scrollWithoutMomentum);
}

// https://github.com/tmcw-up-for-adoption/simple-linear-scale/blob/master/index.js
function linearScale(input: readonly [number, number], output: readonly [number, number]) {
	return (value: number) => {
		if (input[0] === input[1] || output[0] === output[1]) return output[0];
		const ratio = (output[1] - output[0]) / (input[1] - input[0]);
		return output[0] + ratio * (value - input[0]);
	};
}

// @radix-ui/number's clamp, inlined (its only export).
function clamp(value: number, [min, max]: [number, number]): number {
	return Math.min(max, Math.max(min, value));
}

function isScrollingWithinScrollbarBounds(scrollPos: number, maxScrollPos: number): boolean {
	return scrollPos > 0 && scrollPos < maxScrollPos;
}

// Custom scroll handler to avoid scroll-linked effects
// https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Scroll-linked_effects
const addUnlinkedScrollListener = (node: HTMLElement, handler = () => {}): (() => void) => {
	let prevPosition = { left: node.scrollLeft, top: node.scrollTop };
	let rAF = 0;
	(function loop() {
		const position = { left: node.scrollLeft, top: node.scrollTop };
		const isHorizontalScroll = prevPosition.left !== position.left;
		const isVerticalScroll = prevPosition.top !== position.top;
		if (isHorizontalScroll || isVerticalScroll) handler();
		prevPosition = position;
		rAF = window.requestAnimationFrame(loop);
	})();
	return () => window.cancelAnimationFrame(rAF);
};

function useDebounceCallback(
	callback: () => void,
	delay: number,
	slot: symbol | undefined,
): () => void {
	const handleCallback = useCallbackRef(callback, subSlot(slot, 'cb'));
	const debounceTimerRef = useRef(0, subSlot(slot, 'timer'));
	useEffect(
		() => () => window.clearTimeout(debounceTimerRef.current),
		[],
		subSlot(slot, 'e:clear'),
	);
	return useCallback(
		() => {
			window.clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = window.setTimeout(handleCallback, delay);
		},
		[handleCallback, delay],
		subSlot(slot, 'memo'),
	);
}

function useResizeObserver(
	element: HTMLElement | null,
	onResize: () => void,
	slot: symbol | undefined,
): void {
	const handleResize = useCallbackRef(onResize, subSlot(slot, 'cb'));
	useLayoutEffect(
		() => {
			let rAF = 0;
			if (element) {
				// jsdom guard (same as use-size.ts): no ResizeObserver in the test env.
				if (typeof ResizeObserver === 'undefined') return;
				// ResizeObserver can throw a benign "loop completed with undelivered
				// notifications" — deliver via requestAnimationFrame to avoid it.
				const resizeObserver = new ResizeObserver(() => {
					cancelAnimationFrame(rAF);
					rAF = window.requestAnimationFrame(handleResize);
				});
				resizeObserver.observe(element);
				return () => {
					window.cancelAnimationFrame(rAF);
					resizeObserver.unobserve(element);
				};
			}
		},
		[element, handleResize],
		subSlot(slot, 'e'),
	);
}

export {
	Root as ScrollArea,
	Viewport as ScrollAreaViewport,
	Scrollbar as ScrollAreaScrollbar,
	Thumb as ScrollAreaThumb,
	Corner as ScrollAreaCorner,
};
