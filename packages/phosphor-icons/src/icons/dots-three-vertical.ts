// Generated from @phosphor-icons/core@2.1.1 metadata and SVG assets.
// Run `pnpm phosphor-icons:generate`; do not edit by hand.

import createIcon from '../createIcon';
import type { IconWeights } from '../types';

const weights = {
	thin: [
		[
			'path',
			{
				d: 'M120,60a8,8,0,1,1,8,8A8,8,0,0,1,120,60Zm8,60a8,8,0,1,0,8,8A8,8,0,0,0,128,120Zm0,68a8,8,0,1,0,8,8A8,8,0,0,0,128,188Z',
			},
		],
	],
	light: [
		[
			'path',
			{
				d: 'M118,60a10,10,0,1,1,10,10A10,10,0,0,1,118,60Zm10,58a10,10,0,1,0,10,10A10,10,0,0,0,128,118Zm0,68a10,10,0,1,0,10,10A10,10,0,0,0,128,186Z',
			},
		],
	],
	regular: [
		[
			'path',
			{
				d: 'M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128ZM128,72a12,12,0,1,0-12-12A12,12,0,0,0,128,72Zm0,112a12,12,0,1,0,12,12A12,12,0,0,0,128,184Z',
			},
		],
	],
	bold: [
		[
			'path',
			{
				d: 'M112,60a16,16,0,1,1,16,16A16,16,0,0,1,112,60Zm16,52a16,16,0,1,0,16,16A16,16,0,0,0,128,112Zm0,68a16,16,0,1,0,16,16A16,16,0,0,0,128,180Z',
			},
		],
	],
	fill: [
		[
			'path',
			{
				d: 'M160,16H96A16,16,0,0,0,80,32V224a16,16,0,0,0,16,16h64a16,16,0,0,0,16-16V32A16,16,0,0,0,160,16ZM128,208a12,12,0,1,1,12-12A12,12,0,0,1,128,208Zm0-68a12,12,0,1,1,12-12A12,12,0,0,1,128,140Zm0-68a12,12,0,1,1,12-12A12,12,0,0,1,128,72Z',
			},
		],
	],
	duotone: [
		[
			'path',
			{
				d: 'M176,32V224a16,16,0,0,1-16,16H96a16,16,0,0,1-16-16V32A16,16,0,0,1,96,16h64A16,16,0,0,1,176,32Z',
				opacity: '0.2',
			},
		],
		[
			'path',
			{
				d: 'M140,128a12,12,0,1,1-12-12A12,12,0,0,1,140,128ZM128,72a12,12,0,1,0-12-12A12,12,0,0,0,128,72Zm0,112a12,12,0,1,0,12,12A12,12,0,0,0,128,184Z',
			},
		],
	],
} as const satisfies IconWeights;

const Component = createIcon('DotsThreeVertical', weights);

export { Component as DotsThreeVertical, Component as DotsThreeVerticalIcon };
export { weights as __iconWeights };
export default Component;
