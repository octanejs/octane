import type { Modifier } from '@octanejs/dnd-kit-core';
import { restrictToBoundingRect } from './utilities';

export const restrictToParentElement: Modifier = ({
	containerNodeRect,
	draggingNodeRect,
	transform,
}) => {
	if (!draggingNodeRect || !containerNodeRect) {
		return transform;
	}

	return restrictToBoundingRect(transform, draggingNodeRect, containerNodeRect);
};
