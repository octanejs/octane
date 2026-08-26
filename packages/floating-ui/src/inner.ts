// Ported from @floating-ui/react 0.27.19's deprecated inner middleware and hook.
import {
	offset,
	type Derivable,
	type DetectOverflowOptions,
	type Middleware,
	type MiddlewareState,
	type SideObject,
} from '@floating-ui/dom';
import { evaluate, max, min, round } from '@floating-ui/utils';
import { flushSync, useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import type { ElementProps, FloatingRootContext, MutableRefObject } from './types';
import { getUserAgent, useEffectEvent, useModernLayoutEffect } from './utils';

function getArgsWithCustomFloatingHeight(state: MiddlewareState, height: number) {
	return {
		...state,
		rects: {
			...state.rects,
			floating: { ...state.rects.floating, height },
		},
	};
}

export interface InnerProps extends DetectOverflowOptions {
	listRef: MutableRefObject<Array<HTMLElement | null>>;
	index: number;
	onFallbackChange?: null | ((fallback: boolean) => void);
	offset?: number;
	overflowRef?: MutableRefObject<SideObject | null>;
	scrollRef?: MutableRefObject<HTMLElement | null>;
	minItemsVisible?: number;
	referenceOverflowThreshold?: number;
}

/** @deprecated Positions an inner list item against the reference element. */
export const inner = (props: InnerProps | Derivable<InnerProps>): Middleware => ({
	name: 'inner',
	options: props,
	async fn(state) {
		const {
			listRef,
			overflowRef,
			onFallbackChange,
			offset: innerOffset = 0,
			index = 0,
			minItemsVisible = 4,
			referenceOverflowThreshold = 0,
			scrollRef,
			...detectOverflowOptions
		} = evaluate(props, state);
		const {
			rects,
			platform,
			elements: { floating },
		} = state;
		const item = listRef.current[index];
		const scrollEl = scrollRef?.current || floating;
		const clientTop = floating.clientTop || scrollEl.clientTop;
		const floatingIsBordered = floating.clientTop !== 0;
		const scrollElIsBordered = scrollEl.clientTop !== 0;
		const floatingIsScrollEl = floating === scrollEl;
		if (!item) return {};
		const nextArgs = {
			...state,
			...(await offset(
				-item.offsetTop -
					floating.clientTop -
					rects.reference.height / 2 -
					item.offsetHeight / 2 -
					innerOffset,
			).fn(state)),
		};
		const overflow = await platform.detectOverflow(
			getArgsWithCustomFloatingHeight(
				nextArgs,
				scrollEl.scrollHeight + clientTop + floating.clientTop,
			),
			detectOverflowOptions,
		);
		const refOverflow = await platform.detectOverflow(nextArgs, {
			...detectOverflowOptions,
			elementContext: 'reference',
		});
		const diffY = max(0, overflow.top);
		const nextY = nextArgs.y + diffY;
		const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
		const rounder = isScrollable ? (value: number) => value : round;
		const maxHeight = rounder(
			max(
				0,
				scrollEl.scrollHeight +
					((floatingIsBordered && floatingIsScrollEl) || scrollElIsBordered ? clientTop * 2 : 0) -
					diffY -
					max(0, overflow.bottom),
			),
		);
		scrollEl.style.maxHeight = `${maxHeight}px`;
		scrollEl.scrollTop = diffY;
		if (onFallbackChange) {
			const shouldFallback =
				scrollEl.offsetHeight <
					item.offsetHeight * min(minItemsVisible, listRef.current.length) - 1 ||
				refOverflow.top >= -referenceOverflowThreshold ||
				refOverflow.bottom >= -referenceOverflowThreshold;
			flushSync(() => onFallbackChange(shouldFallback));
		}
		if (overflowRef) {
			overflowRef.current = await platform.detectOverflow(
				getArgsWithCustomFloatingHeight(
					{ ...nextArgs, y: nextY },
					scrollEl.offsetHeight + clientTop + floating.clientTop,
				),
				detectOverflowOptions,
			);
		}
		return { y: nextY };
	},
});

export interface UseInnerOffsetProps {
	enabled?: boolean;
	overflowRef: MutableRefObject<SideObject | null>;
	scrollRef?: MutableRefObject<HTMLElement | null>;
	onChange: (offset: number | ((offset: number) => number)) => void;
}

/** @deprecated Expands an inner-positioned list in response to wheel and scroll events. */
export function useInnerOffset(
	context: FloatingRootContext,
	props: UseInnerOffsetProps,
	slot?: symbol,
): ElementProps;
export function useInnerOffset(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = user[1] as UseInnerOffsetProps;
	const { open, elements } = context;
	const { enabled = true, overflowRef, scrollRef, onChange: unstableOnChange } = props;
	const onChange = useEffectEvent(unstableOnChange, subSlot(slot, 'change'));
	const controlledScrollingRef = useRef(false, subSlot(slot, 'controlled'));
	const prevScrollTopRef = useRef<number | null>(null, subSlot(slot, 'prevScrollTop'));
	const initialOverflowRef = useRef<SideObject | null>(null, subSlot(slot, 'initialOverflow'));

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			const el = scrollRef?.current || elements.floating;
			if (!open || !el) return;
			const scrollElement = el;
			function onWheel(event: WheelEvent) {
				if (event.ctrlKey || overflowRef.current == null) return;
				const deltaY = event.deltaY;
				const isAtTop = overflowRef.current.top >= -0.5;
				const isAtBottom = overflowRef.current.bottom >= -0.5;
				const remainingScroll = scrollElement.scrollHeight - scrollElement.clientHeight;
				const sign = deltaY < 0 ? -1 : 1;
				const method = deltaY < 0 ? 'max' : 'min';
				if (scrollElement.scrollHeight <= scrollElement.clientHeight) return;
				if ((!isAtTop && deltaY > 0) || (!isAtBottom && deltaY < 0)) {
					event.preventDefault();
					flushSync(() =>
						onChange((value) => value + Math[method](deltaY, remainingScroll * sign)),
					);
				} else if (/firefox/i.test(getUserAgent())) {
					scrollElement.scrollTop += deltaY;
				}
			}
			scrollElement.addEventListener('wheel', onWheel);
			requestAnimationFrame(() => {
				prevScrollTopRef.current = scrollElement.scrollTop;
				if (overflowRef.current != null) initialOverflowRef.current = { ...overflowRef.current };
			});
			return () => {
				prevScrollTopRef.current = null;
				initialOverflowRef.current = null;
				scrollElement.removeEventListener('wheel', onWheel);
			};
		},
		[enabled, open, elements.floating, overflowRef, scrollRef, onChange],
		subSlot(slot, 'e:wheel'),
	);

	const floating: NonNullable<ElementProps['floating']> = useMemo(
		() => ({
			onKeyDown() {
				controlledScrollingRef.current = true;
			},
			onWheel() {
				controlledScrollingRef.current = false;
			},
			onPointerMove() {
				controlledScrollingRef.current = false;
			},
			onScroll() {
				const el = scrollRef?.current || elements.floating;
				if (!overflowRef.current || !el || !controlledScrollingRef.current) return;
				if (prevScrollTopRef.current !== null) {
					const scrollDiff = el.scrollTop - prevScrollTopRef.current;
					if (
						(overflowRef.current.bottom < -0.5 && scrollDiff < -1) ||
						(overflowRef.current.top < -0.5 && scrollDiff > 1)
					) {
						flushSync(() => onChange((value) => value + scrollDiff));
					}
				}
				requestAnimationFrame(() => {
					prevScrollTopRef.current = el.scrollTop;
				});
			},
		}),
		[elements.floating, onChange, overflowRef, scrollRef],
		subSlot(slot, 'floating'),
	);
	return useMemo(() => (enabled ? { floating } : {}), [enabled, floating], subSlot(slot, 'result'));
}
