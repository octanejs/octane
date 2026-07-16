import type { BoardDocument, BoardId, BoardShape } from './types';

const LAUNCH_SHAPES: readonly BoardShape[] = [
	{
		id: 'audience',
		label: 'Audience insight',
		x: 112,
		y: 112,
		width: 224,
		height: 128,
		fill: '#ffd166',
	},
	{
		id: 'prototype',
		label: 'Prototype flow',
		x: 448,
		y: 94,
		width: 244,
		height: 152,
		fill: '#74d3ae',
	},
	{
		id: 'launch-plan',
		label: 'Launch plan',
		x: 354,
		y: 366,
		width: 260,
		height: 142,
		fill: '#8ec5ff',
	},
	{
		id: 'open-question',
		label: 'Open question',
		x: 760,
		y: 296,
		width: 210,
		height: 132,
		fill: '#f6a6c1',
	},
];

export function createSeededBoard(id: BoardId): BoardDocument {
	if (id === 'empty') {
		return {
			id,
			title: 'Blank exploration',
			updatedBy: 'You',
			shapes: [],
		};
	}
	return {
		id,
		title: 'Launch narrative',
		updatedBy: 'Maya and two others',
		shapes: LAUNCH_SHAPES.map((shape) => ({ ...shape })),
	};
}

export function createFirstShape(): BoardShape {
	return {
		id: 'first-idea',
		label: 'First idea',
		x: 390,
		y: 235,
		width: 250,
		height: 150,
		fill: '#ffd166',
	};
}
