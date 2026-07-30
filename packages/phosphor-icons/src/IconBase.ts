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
		// Everything below shares ONE array child, so each entry needs a key or
		// octane reconciles it by position and warns. Upstream never hits this:
		// its `weights` map holds a single ReactElement per weight, while this
		// port stores `[tag, attributes]` tuples so the generated icons stay
		// tree-shakeable — which makes the keys this package's job.
		//
		// The primitives of a weight are a fixed, never-reordered sequence, so the
		// index is their stable identity. Pairing it with the tag means switching
		// weight reuses a node when the element type matches at that position and
		// replaces it when it does not, instead of patching a <path> into a
		// <circle>.
		children: [
			...(alt ? [createElement('title', { key: 'title', children: alt })] : []),
			...(Array.isArray(children) ? children : children == null ? [] : [children]),
			...weights[weight ?? contextWeight].map(([tag, attributes], index) =>
				createElement(tag, { key: `${tag}-${index}`, ...attributes }),
			),
		],
	});
}

IconBase.displayName = 'IconBase';

export default IconBase;
