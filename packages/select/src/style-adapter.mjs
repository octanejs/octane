import createEmotionCacheModule from '@emotion/cache';
import { serializeStyles } from '@emotion/serialize';
import { getRegisteredStyles, insertStyles } from '@emotion/utils';
import { injectStyle } from 'octane';

const createEmotionCache = createEmotionCacheModule.default ?? createEmotionCacheModule;
let clientCache;

export function createStyleCache(options = {}) {
	return createEmotionCache(options);
}

function cacheForRender() {
	if (typeof document === 'undefined') return createEmotionCache({ key: 'css' });
	clientCache ??= createEmotionCache({ key: 'css' });
	return clientCache;
}

export function resolveComponentStyle(cssValue, className, providedCache, nonce) {
	const cache = providedCache ?? cacheForRender();
	const registeredStyles = [cssValue];
	let composedClassName = '';
	if (typeof className === 'string') {
		composedClassName = getRegisteredStyles(cache.registered, registeredStyles, className);
	}
	const serialized = serializeStyles(registeredStyles);
	composedClassName += `${cache.key}-${serialized.name}`;
	const id = `${cache.key}-${serialized.name}`;

	if (typeof document !== 'undefined') {
		const existing = document.querySelector(
			`style[data-octane="${id}"], style[data-emotion~="${serialized.name}"][data-emotion^="${cache.key} "]`,
		);
		if (existing) cache.inserted[serialized.name] = true;
	}
	const rules = insertStyles(cache, serialized, true);
	if (rules !== undefined && rules !== '') injectStyle(id, rules, nonce);

	return { className: composedClassName, id };
}

export function createKeyframes(cssValue) {
	const serialized = serializeStyles([cssValue]);
	const name = `animation-${serialized.name}`;
	return {
		name,
		styles: `@keyframes ${name}{${serialized.styles}}`,
		anim: 1,
		toString() {
			return `_EMO_${this.name}_${this.styles}_EMO_`;
		},
	};
}
