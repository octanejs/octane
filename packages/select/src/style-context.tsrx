import { createContext, useContext, useMemo } from 'octane';
import type { OctaneNode } from 'octane';

import { createStyleCache, resolveComponentStyle, type StyleCache } from './style-adapter';
import type { CSSObjectWithLabel } from './types';

interface StyleContextValue {
	cache: StyleCache;
	nonce: string;
}

const StyleContext = createContext<StyleContextValue | null>(null);

export function NonceProvider(props: {
	nonce: string;
	children?: OctaneNode;
	cacheKey: string;
}) @{
	const value = useMemo(
		() => ({
			cache: createStyleCache({ key: props.cacheKey, nonce: props.nonce }),
			nonce: props.nonce,
		}),
		[props.cacheKey, props.nonce],
	);
	<StyleContext.Provider value={value}>{props.children}</StyleContext.Provider>
}

export function useStyleResolver() {
	const context = useContext(StyleContext);
	return (cssValue: CSSObjectWithLabel, className?: unknown) => resolveComponentStyle(
		cssValue,
		className,
		context?.cache,
		context?.nonce,
	);
}
