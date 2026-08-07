/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useMainThreadRef } from '@octanejs/lynx';
import type { LynxMainThreadRefCell, LynxPublicHandle } from '@octanejs/lynx';
import { useEffect, useRef } from 'octane';

import { LikeImageCard } from './LikeImageCard.lynx.tsrx';
import type { Picture } from './pictures/furnituresPictures.ts';
import { calculateEstimatedSize } from './utils.ts';

interface GalleryScrollDetail {
	deltaY: number;
	scrollTop: number;
	scrollHeight: number;
	/**
 * The list's own height in px. Native engines report it; Lynx for Web does
 * not, so treat it as optional and fall back to the page height.
 */
	listHeight?: number;
}

export function NiceScrollbarMTS({
	scrollbarRef,
}: {
	scrollbarRef: LynxMainThreadRefCell<object | undefined>;
}) @{
	<view main-thread:ref={scrollbarRef} class="scrollbar">
		<view class="scrollbar-effect glow" />
	</view>
}

export function Gallery({ pictureData }: { pictureData: Picture[] }) @{
	const scrollbarMTSRef = useMainThreadRef<object>();
	const galleryMTSRef = useMainThreadRef<object>();
	const galleryRef = useRef<LynxPublicHandle | null>(null);

	const onScrollMTS = (event: { detail: GalleryScrollDetail }) => {
		'main thread';
		const scrollbar = scrollbarMTSRef.current;
		const gallery = galleryMTSRef.current;
		if (
			scrollbar === null || scrollbar === undefined || gallery === null || gallery === undefined
		) return;
		// The viewport the scrollbar maps onto is the list's own box. Native
		// engines report it directly; Lynx for Web does not, and there the list
		// fills the page, so the page height is the same number.
		//
		// Deriving it from SystemInfo *minus a fixed 48px* — as this example used
		// to — assumed a full-screen page behind Explorer's title bar. That was
		// wrong on Web, wrong in Explorer's fullscreen mode, and it also left the
		// list 48px short of its wrapper, which is where the black band came from.
		const listHeight = event.detail.listHeight ?? SystemInfo.pixelHeight / SystemInfo.pixelRatio;
		const scrollbarHeight = listHeight * (listHeight / event.detail.scrollHeight);
		const scrollbarTop = listHeight * (event.detail.scrollTop / event.detail.scrollHeight);
		__AddInlineStyle(scrollbar, 'height', scrollbarHeight + 'px');
		__AddInlineStyle(scrollbar, 'top', scrollbarTop + 'px');
		__FlushElementTree();

		const atBottom = event.detail.scrollTop + listHeight >= event.detail.scrollHeight;
		if (event.detail.deltaY > 0 && atBottom) {
			__InvokeUIMethod(
				gallery,
				'autoScroll',
				{ rate: '-60', start: true, autoStop: true },
				() => {},
			);
		} else if (event.detail.deltaY < 0 && event.detail.scrollTop <= 0) {
			__InvokeUIMethod(
				gallery,
				'autoScroll',
				{ rate: '60', start: true, autoStop: true },
				() => {},
			);
		}
	};

	useEffect(() => {
		void galleryRef.current?.invoke('autoScroll', { rate: '60', start: true, autoStop: true });
	}, []);

	<view class="gallery-wrapper">
		<NiceScrollbarMTS scrollbarRef={scrollbarMTSRef} />
		<list
			ref={galleryRef}
			main-thread:ref={galleryMTSRef}
			class="list"
			list-type="waterfall"
			span-count={2}
			scroll-orientation="vertical"
			main-thread:bindscroll={onScrollMTS}
			scroll-event-throttle={0}
		>
			@for (const picture of pictureData; key picture.id) {
				<list-item
					estimated-main-axis-size-px={calculateEstimatedSize(picture.width, picture.height)}
					item-key={picture.id}
				>
					<LikeImageCard picture={picture} />
				</list-item>
			}
		</list>
	</view>
}
