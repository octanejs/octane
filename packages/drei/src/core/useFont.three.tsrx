import { use } from '@octanejs/three/renderer';
import { loadFont, type FontInput } from './font-resource.js';
import { clearResource, preloadResource, resourcePromise } from './resource.js';

export type { FontData, Glyph } from './font-resource.js';

export function useFont(font: FontInput) {
	return use(resourcePromise(loadFont, [font]));
}

useFont.preload = (font: FontInput) => preloadResource(loadFont, [font]);
useFont.clear = (font: FontInput) => clearResource([font]);
