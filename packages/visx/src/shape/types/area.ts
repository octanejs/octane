import type { Area } from 'd3-shape';
import type { Ref } from 'react';
import type { OctaneNode } from 'octane';
import type { AreaPathConfig } from './D3ShapeConfig';

export type BaseAreaProps<Datum> = {
	/** Override render function which is passed the configured area generator as input. */
	children?: (args: { path: Area<Datum> }) => OctaneNode;
	/** Classname applied to path element. */
	className?: string;
	/** Array of data for which to generate an area shape. */
	data?: Datum[];
	/** React RefObject passed to the path element. */
	innerRef?: Ref<SVGPathElement>;
} & AreaPathConfig<Datum>;
