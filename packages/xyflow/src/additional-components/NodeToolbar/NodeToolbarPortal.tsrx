import { OctaneNode } from 'octane';
import { createPortal } from 'octane';

import type { ReactFlowState } from '../../types';
import { useStore } from '../../hooks/useStore';

const selector = (state: ReactFlowState) => state.domNode?.querySelector('.react-flow__renderer');

export function NodeToolbarPortal({ children }: { children: OctaneNode }) {
	const wrapperRef = useStore(selector);

	if (!wrapperRef) {
		return null;
	}

	return createPortal(children, wrapperRef);
}
