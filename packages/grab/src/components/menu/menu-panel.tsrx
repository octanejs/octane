import type { Component, JSX, OctaneNode } from '../../reactive.js';
import { cn } from '../../utils/cn.js';
import { Surface } from '../ui/surface.tsrx';

interface MenuPanelProps {
	class?: string;
	style?: JSX.CSSProperties;
	children: OctaneNode;
}

export const MenuPanel: Component<MenuPanelProps> = (props) =>
	<Surface
		class={cn('flex flex-col w-fit h-fit', props.class)}
		style={props.style}
	>{props.children}</Surface>;
