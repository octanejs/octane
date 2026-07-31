import { createElement } from 'octane';
import IconBase from './IconBase';
import type { Icon, IconProps, IconWeights } from './types';

export function createIcon(name: string, weights: IconWeights): Icon {
	const Component = (props: IconProps) => createElement(IconBase, { ...props, weights });
	Component.displayName = `${name}Icon`;
	return Component;
}

export default createIcon;
