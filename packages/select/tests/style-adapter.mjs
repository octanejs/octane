import cacheModule from '@emotion/cache';
import { serializeStyles } from '@emotion/serialize';
import { getRegisteredStyles, insertStyles } from '@emotion/utils';

const createCache = cacheModule.default ?? cacheModule;

export function getSerializedNames(serialized) {
	let names = serialized.name;
	let next = serialized.next;
	while (next !== undefined) {
		names += ` ${next.name}`;
		next = next.next;
	}
	return names;
}

export function createStyleCache(options) {
	return createCache(options);
}

export function prepareStyle(cache, cssValue, className, theme = {}) {
	if (typeof cssValue === 'string' && cache.registered[cssValue] !== undefined) {
		cssValue = cache.registered[cssValue];
	}

	const registeredStyles = [cssValue];
	let composedClassName = '';
	if (typeof className === 'string') {
		composedClassName = getRegisteredStyles(cache.registered, registeredStyles, className);
	} else if (className != null) {
		composedClassName = `${className} `;
	}

	const serialized = serializeStyles(registeredStyles, undefined, theme);
	composedClassName += `${cache.key}-${serialized.name}`;

	return {
		className: composedClassName,
		dataEmotion: `${cache.key} ${getSerializedNames(serialized)}`,
		id: `${cache.key}-${serialized.name}`,
		serialized,
	};
}

export function insertPreparedStyle(cache, prepared, isStringTag = true) {
	return { ...prepared, rules: insertStyles(cache, prepared.serialized, isStringTag) };
}

export function resolveStyle(cache, cssValue, className, theme = {}, isStringTag = true) {
	return insertPreparedStyle(cache, prepareStyle(cache, cssValue, className, theme), isStringTag);
}

export function adoptServerStyle(cache, serializedName, root = document) {
	const id = `${cache.key}-${serializedName}`;
	if (
		root.querySelector(
			`style[data-octane="${id}"], style[data-emotion~="${serializedName}"][data-emotion^="${cache.key} "]`,
		)
	) {
		cache.inserted[serializedName] = true;
		return true;
	}
	return false;
}
