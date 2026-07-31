/** @jsxImportSource @octanejs/lynx/intrinsics */
import { useMainThreadRef } from '@octanejs/lynx';
import type { LynxMainThreadRefCell, LynxPublicHandle } from '@octanejs/lynx';
import { useEffect, useRef } from 'octane';

import { LikeImageCard } from './LikeImageCard.lynx.tsrx';
import type { Picture } from './pictures/furnituresPictures.ts';
import { calculateEstimatedSize } from './utils.ts';

interface GalleryScrollDetail {
	scrollTop: number;
	scrollHeight: number;
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
	const galleryRef = useRef<LynxPublicHandle | null>(null);

	const onScrollMTS = (event: { detail: GalleryScrollDetail }) => {
		'main thread';
		const scrollbar = scrollbarMTSRef.current;
		if (scrollbar === null || scrollbar === undefined) return;
		const listHeight = SystemInfo.pixelHeight / SystemInfo.pixelRatio - 48;
		const scrollbarHeight = listHeight * (listHeight / event.detail.scrollHeight);
		const scrollbarTop = listHeight * (event.detail.scrollTop / event.detail.scrollHeight);
		__AddInlineStyle(scrollbar, 'height', scrollbarHeight + 'px');
		__AddInlineStyle(scrollbar, 'top', scrollbarTop + 'px');
		__FlushElementTree();
	};

	useEffect(() => {
		void galleryRef.current?.invoke('autoScroll', { rate: '60', start: true });
	}, []);

	<view class="gallery-wrapper">
		<NiceScrollbarMTS scrollbarRef={scrollbarMTSRef} />
		<list
			ref={galleryRef}
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
