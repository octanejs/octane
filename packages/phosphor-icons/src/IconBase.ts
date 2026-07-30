import { createElement, useContext } from 'octane';
import { IconContext } from './context';
import type { IconProps, IconWeights } from './types';

export interface IconBaseProps extends IconProps {
	weights: IconWeights;
}

export function IconBase(props: IconBaseProps) {
	const { alt, color, size, weight, mirrored, children, weights, ref, ...rest } = props;
	const {
		color: contextColor = 'currentColor',
		size: contextSize = '1em',
		weight: contextWeight = 'regular',
		mirrored: contextMirrored = false,
		ref: _contextRef,
		...contextRest
	} = useContext(IconContext);

	return createElement('svg', {
		xmlns: 'http://www.w3.org/2000/svg',
		width: size ?? contextSize,
		height: size ?? contextSize,
		fill: color ?? contextColor,
		viewBox: '0 0 256 256',
		transform: (mirrored ?? contextMirrored) ? 'scale(-1, 1)' : undefined,
		...contextRest,
		...rest,
		ref,
		children: [
			...(alt ? [createElement('title', { children: alt })] : []),
			...(Array.isArray(children) ? children : children == null ? [] : [children]),
			...weights[weight ?? contextWeight].map(([tag, attributes]) =>
				createElement(tag, attributes),
			),
		],
	});
}

IconBase.displayName = 'IconBase';

export default IconBase;
