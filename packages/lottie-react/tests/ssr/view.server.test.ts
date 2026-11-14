import { renderToString } from 'octane/server';
import { expect, it } from 'vitest';

import Lottie, { LottiePlayer } from '../../src/index.js';

it('renders the animation container on the server without starting a player', () => {
	const ref = { current: null };
	const html = renderToString(Lottie, {
		animationData: {},
		loop: true,
		autoplay: false,
		lottieRef: ref,
		id: 'animation',
		style: { width: '4px' },
	}).html;
	expect(html).toMatch(/<div [^>]*id="animation"[^>]*><\/div>/);
	expect(html).toContain('style="width:4px;"');
	expect(html).not.toContain('autoplay');
	expect(html).not.toContain('loop=');
	expect(ref.current).toBeNull();
	// lottie-web exports an inert object when imported without browser globals.
	expect(typeof LottiePlayer).toBe('object');
});
