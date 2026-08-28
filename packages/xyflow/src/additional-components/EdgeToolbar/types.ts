import type { HTMLAttributes, OctaneNode } from '../../react-shim.js';
import type { EdgeToolbarBaseProps } from '@xyflow/system';

/**
 * @inline
 */
export type EdgeToolbarProps = EdgeToolbarBaseProps &
	HTMLAttributes<HTMLDivElement> & {
		/**
		 * An edge toolbar must be attached to an edge.
		 */
		edgeId: string;
		children?: OctaneNode;
	};
