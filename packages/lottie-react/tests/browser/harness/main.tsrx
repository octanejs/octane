import { createRoot, hydrateRoot } from 'octane';
import { createElement, flushSync } from './react-oracle.js';
import { createRoot as createReactRoot, hydrateRoot as hydrateReactRoot } from 'react-dom/client';
import ReactLottie, { LottiePlayer as ReactPlayer } from 'lottie-react';
import type { AnimationItem } from 'lottie-web';

import Lottie, { LottiePlayer, type LottieRef } from '../../../src/index.js';
import animationData from '../../../upstream/src/__tests__/assets/groovyWalk.json';

const native = new URLSearchParams(location.search).get('renderer') === 'octane';
const container = document.getElementById('root')!;
const original = container.querySelector('#animation');
const ref: LottieRef = { current: null };
const player = native ? LottiePlayer : ReactPlayer;
let destroys = 0;
const onDestroy = () => destroys++;
const props = { animationData, id: 'animation', autoplay: false, lottieRef: ref, onDestroy };
const root = native
	? original
		? hydrateRoot(container, Lottie, props)
		: createRoot(container)
	: original
		? hydrateReactRoot(container, createElement(ReactLottie, props))
		: createReactRoot(container);
let first: AnimationItem | undefined;

function render(loop: boolean) {
	if (native) root.render(Lottie, { ...props, loop });
	else flushSync(() => root.render(createElement(ReactLottie, { ...props, loop })));
}

if (!original) render(false);

Object.assign(window, {
	snapshot() {
		return {
			svg: container.querySelectorAll('#animation svg').length,
			loaded: ref.current?.animationLoaded ?? false,
			adopted: original === null || container.querySelector('#animation') === original,
			registered: player.getRegisteredAnimations().length,
			destroys,
			hasRef: ref.current !== null,
		};
	},
	replaceAnimation() {
		const saved = ref.current!;
		first = saved.animationItem;
		saved.goToAndStop(5, true);
		const frame = first?.currentRawFrame;
		render(true);
		return frame;
	},
	replacement() {
		const active = player.getRegisteredAnimations()[0];
		ref.current?.goToAndStop(6, true);
		return {
			replaced: active !== first,
			loaded: ref.current?.animationLoaded ?? false,
			frame: active?.currentRawFrame,
			destroys,
		};
	},
	unmount() {
		root.unmount();
	},
});
