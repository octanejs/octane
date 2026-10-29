import type { Modifier } from '@octanejs/dnd-kit-core';

export const restrictToVerticalAxis: Modifier = ({ transform }) => {
	return {
		...transform,
		x: 0,
	};
};
