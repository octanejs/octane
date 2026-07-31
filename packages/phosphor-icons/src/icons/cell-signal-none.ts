// Generated from @phosphor-icons/core@2.1.1 metadata and SVG assets.
// Run `pnpm phosphor-icons:generate`; do not edit by hand.

import createIcon from '../createIcon';
import type { IconWeights } from '../types';

const weights = {
	thin: [['path', { d: 'M44,192v8a4,4,0,0,1-8,0v-8a4,4,0,0,1,8,0Z' }]],
	light: [['path', { d: 'M46,192v8a6,6,0,0,1-12,0v-8a6,6,0,0,1,12,0Z' }]],
	regular: [['path', { d: 'M48,192v8a8,8,0,0,1-16,0v-8a8,8,0,0,1,16,0Z' }]],
	bold: [['path', { d: 'M52,192v8a12,12,0,0,1-24,0v-8a12,12,0,0,1,24,0Z' }]],
	fill: [
		[
			'path',
			{
				d: 'M198.12,25.23a16,16,0,0,0-17.44,3.46l-160,160A16,16,0,0,0,32,216H192a16,16,0,0,0,16-16V40A15.94,15.94,0,0,0,198.12,25.23ZM192,200H32L192,40Z',
			},
		],
	],
	duotone: [
		[
			'path',
			{
				d: 'M198.12,25.23a16,16,0,0,0-17.43,3.47l-160,160A16,16,0,0,0,32,216H192a16,16,0,0,0,16-16V40A16,16,0,0,0,198.12,25.23ZM192,200H32L192,40Z',
			},
		],
	],
} as const satisfies IconWeights;

const Component = createIcon('CellSignalNone', weights);

export { Component as CellSignalNone, Component as CellSignalNoneIcon };
export { weights as __iconWeights };
export default Component;
