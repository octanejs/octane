import { createContext } from 'octane';
import type { IconProps } from './types';

type IconContextValue = IconProps & {
	/**
	 * Refs belong to individual icon instances and are never inherited.
	 */
	ref?: never;
};

export const IconContext = createContext<IconContextValue>({
	color: 'currentColor',
	size: '1em',
	weight: 'regular',
	mirrored: false,
});
