/** @jsxImportSource @octanejs/lynx/intrinsics */
import { runOnBackground, runOnMainThread, useMainThreadRef } from '@octanejs/lynx';
import { useEffect, useState } from 'octane';

import { Indicator } from './Indicator.lynx.tsrx';
import { SwiperItem } from './SwiperItem.lynx.tsrx';

interface SwiperTouchEvent {
	touches: { clientX: number }[];
}

type EasingFunction = (t: number) => number;

export const easings = {
	linear: (t: number) => {
		'main thread';
		return t;
	},
	easeInOutQuad: (t: number) => {
		'main thread';
		return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
	},
};

// Octane thread functions capture data only, so the background index listener
// lives at module scope (module bindings are resolved in the background graph,
// not captured) and the mounted Swiper subscribes its state setter. One Swiper
// instance per page, matching the tutorial.
let notifyIndexUpdate: ((index: number) => void) | null = null;

const publishIndexUpdate = (index: number) => {
	'background only';
	notifyIndexUpdate?.(index);
};

export function Swiper({
	data,
	itemWidth = SystemInfo.pixelWidth / SystemInfo.pixelRatio,
	easing,
}: {
	data: string[];
	itemWidth?: number;
	easing?: EasingFunction;
}) @{
	const [current, setCurrent] = useState(0);

	const containerRef = useMainThreadRef<object>();
	const touchStartXRef = useMainThreadRef<number>(0);
	const touchStartCurrentOffsetRef = useMainThreadRef<number>(0);
	const currentOffsetRef = useMainThreadRef<number>(0);
	const currentIndexRef = useMainThreadRef<number>(0);
	const lastCancelRef = useMainThreadRef<(() => void) | null>(null);

	const dataLength = data.length;

	useEffect(() => {
		notifyIndexUpdate = setCurrent;
		return () => {
			notifyIndexUpdate = null;
		};
	}, []);

	const updateSwiperStyle = (offset: number) => {
		'main thread';
		const container = containerRef.current;
		if (container === null || container === undefined) return;
		__AddInlineStyle(container as object, 'transform', `translateX(${offset}px)`);
		__FlushElementTree();
	};

	const calcNearestPage = (offset: number) => {
		'main thread';
		const nearestPage = Math.round(offset / itemWidth);
		return nearestPage * itemWidth;
	};

	const updateOffset = (offset: number) => {
		'main thread';
		const lowerBound = 0;
		const upperBound = -(dataLength - 1) * itemWidth;

		const realOffset = Math.min(lowerBound, Math.max(upperBound, offset));
		currentOffsetRef.current = realOffset;
		updateSwiperStyle(realOffset);
		const index = Math.round(-realOffset / itemWidth);
		if (currentIndexRef.current !== index) {
			currentIndexRef.current = index;
			void runOnBackground(publishIndexUpdate)(index);
		}
	};

	const cancelAnimate = () => {
		'main thread';
		lastCancelRef.current?.();
	};

	// Octane thread-function calls carry data-only arguments, so the animation
	// loop lives inline (its closures stay main-local) instead of ReactLynx's
	// useAnimate hook, which passes easing/onUpdate callbacks between worklets.
	const animateToNearestPage = () => {
		'main thread';
		cancelAnimate();
		const from = currentOffsetRef.current;
		const to = calcNearestPage(from);
		const duration = 3000;
		const ease = easing ?? easings.easeInOutQuad;

		let startTs = 0;
		let rafId = 0;
		function step(ts: number) {
			if (!startTs) {
				startTs = Number(ts);
			}
			// make sure progress can reach 100%
			if (ts - startTs <= duration + 100) {
				const progress = Math.max(Math.min(((ts - startTs) * 100) / duration, 100), 0) / 100;
				const easedProgress = ease(progress);
				updateOffset(from + (to - from) * easedProgress);
				rafId = requestAnimationFrame(step);
			}
		}
		rafId = requestAnimationFrame(step);
		lastCancelRef.current = () => cancelAnimationFrame(rafId);
	};

	const handleTouchStart = (e: SwiperTouchEvent) => {
		'main thread';
		touchStartXRef.current = e.touches[0]!.clientX;
		touchStartCurrentOffsetRef.current = currentOffsetRef.current;
		cancelAnimate();
	};

	const handleTouchMove = (e: SwiperTouchEvent) => {
		'main thread';
		const touchMoveX = e.touches[0]!.clientX;
		const deltaX = touchMoveX - touchStartXRef.current;
		updateOffset(touchStartCurrentOffsetRef.current + deltaX);
	};

	const handleTouchEnd = () => {
		'main thread';
		touchStartXRef.current = 0;
		touchStartCurrentOffsetRef.current = 0;
		animateToNearestPage();
	};

	const updateIndex = (index: number) => {
		const offset = -index * itemWidth;
		void runOnMainThread(updateOffset)(offset);
	};

	const handleItemClick = (index: number) => {
		setCurrent(index);
		updateIndex(index);
	};

	<view class="swiper-wrapper">
		<view
			class="swiper-container"
			main-thread:ref={containerRef}
			main-thread:bindtouchstart={handleTouchStart}
			main-thread:bindtouchmove={handleTouchMove}
			main-thread:bindtouchend={handleTouchEnd}
		>
			@for (const pic of data; key pic) {
				<SwiperItem pic={pic} itemWidth={itemWidth} />
			}
		</view>
		<Indicator total={dataLength} current={current} onItemClick={handleItemClick} />
	</view>
}
