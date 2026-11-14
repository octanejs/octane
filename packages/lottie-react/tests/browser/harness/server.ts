import { renderToString } from 'octane/server';
import { createElement } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import { createRequire } from 'node:module';
import type ReactLottie from 'lottie-react';

import Lottie from '../../../src/index.js';
import animationData from '../../../upstream/src/__tests__/assets/groovyWalk.json';

// Load the released CommonJS entry with its own default export.
const { default: OriginalLottie } = createRequire(import.meta.url)('lottie-react') as {
	default: typeof ReactLottie;
};

export function markup(native: boolean) {
	const props = { animationData, id: 'animation', autoplay: false };
	return native
		? renderToString(Lottie, props).html
		: renderReactToString(createElement(OriginalLottie, props));
}
