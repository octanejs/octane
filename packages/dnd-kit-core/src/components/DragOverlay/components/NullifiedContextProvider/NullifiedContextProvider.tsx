/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';
import type { Transform } from '@octanejs/dnd-kit-utilities';

import { InternalContext, defaultInternalContext } from '../../../../store';
import { ActiveDraggableContext } from '../../../DndContext';

interface Props {
	children: OctaneNode;
}

const defaultTransform: Transform = {
	x: 0,
	y: 0,
	scaleX: 1,
	scaleY: 1,
};

export function NullifiedContextProvider({ children }: Props) {
	return (
		<InternalContext value={defaultInternalContext}>
			<ActiveDraggableContext value={defaultTransform}>{children}</ActiveDraggableContext>
		</InternalContext>
	);
}
