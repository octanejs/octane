/** @jsxImportSource octane */
import type { OctaneNode } from 'octane';
import { cn } from '../../utils/cn.js';
import { Surface } from '../ui/surface.js';

interface MenuPanelProps {
	class?: string;
	style?: Record<string, string | number>;
	children: OctaneNode;
}

export const MenuPanel = (props: MenuPanelProps) => (
	<Surface class={cn('flex flex-col w-fit h-fit', props.class)} style={props.style}>
		{props.children}
	</Surface>
);
