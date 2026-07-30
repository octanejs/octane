// Generated from @phosphor-icons/core@2.1.1 metadata and SVG assets.
// Run `pnpm phosphor-icons:generate`; do not edit by hand.

import createIcon from '../createIcon';
import type { IconWeights } from '../types';

const weights = {
	thin: [
		[
			'path',
			{
				d: 'M232,220H204V40a12,12,0,0,0-12-12H64A12,12,0,0,0,52,40V220H24a4,4,0,0,0,0,8H232a4,4,0,0,0,0-8ZM196,40V220H172V36h20A4,4,0,0,1,196,40ZM60,40a4,4,0,0,1,4-4H164V220H60Zm80,92a8,8,0,1,1-8-8A8,8,0,0,1,140,132Z',
			},
		],
	],
	light: [
		[
			'path',
			{
				d: 'M232,218H206V40a14,14,0,0,0-14-14H64A14,14,0,0,0,50,40V218H24a6,6,0,0,0,0,12H232a6,6,0,0,0,0-12ZM194,40V218H174V38h18A2,2,0,0,1,194,40ZM62,40a2,2,0,0,1,2-2h98V218H62Zm80,92a10,10,0,1,1-10-10A10,10,0,0,1,142,132Z',
			},
		],
	],
	regular: [
		[
			'path',
			{
				d: 'M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-40,0H176V40h16ZM64,40h96V216H64Zm80,92a12,12,0,1,1-12-12A12,12,0,0,1,144,132Z',
			},
		],
	],
	bold: [
		[
			'path',
			{
				d: 'M232,212H212V40a20,20,0,0,0-20-20H64A20,20,0,0,0,44,40V212H24a12,12,0,0,0,0,24H232a12,12,0,0,0,0-24Zm-44,0H172V44h16ZM68,44h80V212H68Zm68,84a16,16,0,1,1-16-16A16,16,0,0,1,136,128Z',
			},
		],
	],
	fill: [
		[
			'path',
			{
				d: 'M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-64,0H64V40H168Zm-40-84a12,12,0,1,1,12,12A12,12,0,0,1,128,132Z',
			},
		],
	],
	duotone: [
		['path', { d: 'M200,40V224H168V32h24A8,8,0,0,1,200,40Z', opacity: '0.2' }],
		[
			'path',
			{
				d: 'M232,216H208V40a16,16,0,0,0-16-16H64A16,16,0,0,0,48,40V216H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-40,0H176V40h16ZM64,40h96V216H64Zm80,92a12,12,0,1,1-12-12A12,12,0,0,1,144,132Z',
			},
		],
	],
} as const satisfies IconWeights;

const Component = createIcon('DoorOpen', weights);

export { Component as DoorOpen, Component as DoorOpenIcon };
export { weights as __iconWeights };
export default Component;
