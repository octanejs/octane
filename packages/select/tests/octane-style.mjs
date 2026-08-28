import { adoptServerStyle, insertPreparedStyle, prepareStyle } from './style-adapter.mjs';

export function resolveOctaneStyle(
	cache,
	cssValue,
	className,
	theme = {},
	injectStyle = undefined,
) {
	const prepared = prepareStyle(cache, cssValue, className, theme);
	if (typeof document !== 'undefined') {
		adoptServerStyle(cache, prepared.serialized.name, document);
	}
	const resolved = insertPreparedStyle(cache, prepared);
	if (resolved.rules !== undefined && resolved.rules !== '' && injectStyle !== undefined) {
		injectStyle(resolved.id, resolved.rules);
	}
	return resolved;
}
