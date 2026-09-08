import { Suspense, createElement } from 'octane';
import { icons } from './icons';
import type { IconSymbol } from './icons';
import type { SanityIconProps } from './types';

export interface IconProps extends SanityIconProps {
	symbol: IconSymbol;
}

export function Icon(props: IconProps) {
	const { symbol, ref, ...restProps } = props;
	const IconComponent = icons[symbol];
	if (!IconComponent) return null;
	const fallback = createElement('svg', {
		'data-sanity-icon': symbol,
		width: '1em',
		height: '1em',
		viewBox: '0 0 25 25',
		fill: 'none',
		xmlns: 'http://www.w3.org/2000/svg',
		...restProps,
		ref,
	});
	return createElement(Suspense, {
		fallback,
		children: createElement(IconComponent, { ...restProps, ref }),
	});
}
