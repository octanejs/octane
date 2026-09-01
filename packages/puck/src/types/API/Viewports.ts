import { OctaneNode } from '../../react-shim.js';

type iconTypes = 'Smartphone' | 'Monitor' | 'Tablet';

export type Viewport = {
	width: number;
	height?: number | 'auto';
	label?: string;
	icon?: iconTypes | OctaneNode;
};

export type Viewports = Viewport[];
