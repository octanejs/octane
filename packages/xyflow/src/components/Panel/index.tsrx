import cc from 'classcat';
import type { PanelPosition } from '@xyflow/system';
import type { HTMLAttributes } from '../../react-shim.js';
import { fixedForwardRef } from '../../utils/general';

/**
 * @expand
 */
export type PanelProps =
	HTMLAttributes<HTMLDivElement> & {
		/**
 * The position of the panel.
 * @default "top-left"
 */
		position?: PanelPosition;
	};

function PanelComponent(
	{ position = 'top-left', children, className, style, ...rest }: PanelProps,
	ref: import('octane/jsx-runtime').Octane.Ref,
) {
	const positionClasses = `${position}`.split('-');

	return <div
		className={cc(['react-flow__panel', className, ...positionClasses])}
		style={style}
		ref={ref}
		{...rest}
	>{children}</div>;
}

export const Panel = fixedForwardRef(PanelComponent);

Panel.displayName = 'Panel';
