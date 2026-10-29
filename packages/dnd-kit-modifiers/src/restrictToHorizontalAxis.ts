import type { Modifier } from '@octanejs/dnd-kit-core';

export const restrictToHorizontalAxis: Modifier = ({ transform }) => {
	return {
		...transform,
		y: 0,
	};
};
