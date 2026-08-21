import type { CSSProperties } from 'react';
import type { Octane } from 'octane/jsx-runtime';
import { Bar } from '@octanejs/visx/shape';

type BrushOverlayProps = {
	width: number;
	height: number;
	style?: CSSProperties;
} & Pick<
	Octane.SVGProps<SVGRectElement>,
	| 'onClick'
	| 'onDoubleClick'
	| 'onPointerDown'
	| 'onPointerLeave'
	| 'onPointerMove'
	| 'onPointerUp'
>;

export default function BrushOverlay(props: BrushOverlayProps) {
	return <Bar className="visx-brush-overlay" fill="transparent" x={0} y={0} {...props} />;
}
