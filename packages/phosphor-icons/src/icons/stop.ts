// Generated from @phosphor-icons/core@2.1.1 metadata and SVG assets.
// Run `pnpm phosphor-icons:generate`; do not edit by hand.

import createIcon from '../createIcon';
import type { IconWeights } from '../types';

const weights = {
	thin: [
		[
			'path',
			{
				d: 'M200,44H56A12,12,0,0,0,44,56V200a12,12,0,0,0,12,12H200a12,12,0,0,0,12-12V56A12,12,0,0,0,200,44Zm4,156a4,4,0,0,1-4,4H56a4,4,0,0,1-4-4V56a4,4,0,0,1,4-4H200a4,4,0,0,1,4,4Z',
			},
		],
	],
	light: [
		[
			'path',
			{
				d: 'M200,42H56A14,14,0,0,0,42,56V200a14,14,0,0,0,14,14H200a14,14,0,0,0,14-14V56A14,14,0,0,0,200,42Zm2,158a2,2,0,0,1-2,2H56a2,2,0,0,1-2-2V56a2,2,0,0,1,2-2H200a2,2,0,0,1,2,2Z',
			},
		],
	],
	regular: [
		[
			'path',
			{
				d: 'M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,160H56V56H200V200Z',
			},
		],
	],
	bold: [
		[
			'path',
			{
				d: 'M200,36H56A20,20,0,0,0,36,56V200a20,20,0,0,0,20,20H200a20,20,0,0,0,20-20V56A20,20,0,0,0,200,36Zm-4,160H60V60H196Z',
			},
		],
	],
	fill: [
		[
			'path',
			{
				d: 'M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z',
			},
		],
	],
	duotone: [
		[
			'path',
			{
				d: 'M208,56V200a8,8,0,0,1-8,8H56a8,8,0,0,1-8-8V56a8,8,0,0,1,8-8H200A8,8,0,0,1,208,56Z',
				opacity: '0.2',
			},
		],
		[
			'path',
			{
				d: 'M200,40H56A16,16,0,0,0,40,56V200a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V56A16,16,0,0,0,200,40Zm0,160H56V56H200V200Z',
			},
		],
	],
} as const satisfies IconWeights;

const Component = createIcon('Stop', weights);

export { Component as Stop, Component as StopIcon };
export { weights as __iconWeights };
export default Component;
