// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useLoadMoreSentinel.ts
// — react-aria's private `useLoadMoreSentinel` util, exposed to RAC as
// 'react-aria/private/utils/useLoadMoreSentinel'). First landed module-locally in
// ./components/ListBox.ts; hoisted here verbatim once GridList became the second
// consumer. octane adaptations: private-util slot threading (the trailing `slot`
// parameter — callers pass their derived sub-slot); explicit dep arrays are
// preserved verbatim.
import type { AsyncLoadable, Collection as ICollection, Node } from '@react-types/shared';

import { useRef } from 'octane';

import { subSlot } from '../internal';
import { getScrollParent } from './getScrollParent';
import { useEffectEvent } from './useEffectEvent';
import { useLayoutEffect } from './useLayoutEffect';

type RefObject<T> = { current: T };

export interface LoadMoreSentinelProps extends Omit<AsyncLoadable, 'isLoading'> {
	collection: ICollection<Node<any>>;
	/**
	 * The amount of offset from the bottom of your scrollable region that should trigger load more.
	 * Uses a percentage value relative to the scroll body's client height. Load more is then
	 * triggered when your current scroll position's distance from the bottom of the currently loaded
	 * list of items is less than or equal to the provided value. (e.g. 1 = 100% of the scroll
	 * region's height).
	 *
	 * @default 1
	 */
	scrollOffset?: number;
}

export function useLoadMoreSentinel(
	props: LoadMoreSentinelProps,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): void {
	let { collection, onLoadMore, scrollOffset = 1 } = props;

	let sentinelObserver = useRef<IntersectionObserver | null>(null, subSlot(slot, 'observer'));

	let triggerLoadMore = useEffectEvent(
		(entries: IntersectionObserverEntry[]) => {
			// Use "isIntersecting" over an equality check of 0 since it seems like there is cases where
			// a intersection ratio of 0 can be reported when isIntersecting is actually true
			for (let entry of entries) {
				// Note that this will be called if the collection changes, even if onLoadMore was already called and is being processed.
				// Up to user discretion as to how to handle these multiple onLoadMore calls
				if (entry.isIntersecting && onLoadMore) {
					onLoadMore();
				}
			}
		},
		subSlot(slot, 'trigger'),
	);

	useLayoutEffect(
		() => {
			if (ref.current) {
				// Tear down and set up a new IntersectionObserver when the collection changes so that we can properly trigger additional loadMores if there is room for more items
				// Need to do this tear down and set up since using a large rootMargin will mean the observer's callback isn't called even when scrolling the item into view beause its visibility hasn't actually changed
				sentinelObserver.current = new IntersectionObserver(triggerLoadMore, {
					root: getScrollParent(ref?.current) as HTMLElement,
					rootMargin: `0px ${100 * scrollOffset}% ${100 * scrollOffset}% ${100 * scrollOffset}%`,
				});
				sentinelObserver.current.observe(ref.current);
			}

			return () => {
				if (sentinelObserver.current) {
					sentinelObserver.current.disconnect();
				}
			};
		},
		[collection, ref, scrollOffset],
		subSlot(slot, 'observe'),
	);
}
