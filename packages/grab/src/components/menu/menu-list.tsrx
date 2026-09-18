import { resolveProp, useProp, type Component, type JSX, type OctaneNode } from '../../reactive.js';
import { cn } from '../../utils/cn.js';
import { useMenuStore } from './menu-context.js';

interface MenuListProps {
	ref?: (element: HTMLDivElement | null) => void;
	class?: string;
	label?: string;
	children: OctaneNode;
}

export const MenuList: Component<MenuListProps> = (props) => {
	const store = useMenuStore();
	const label = useProp(props.label);
	const className = useProp(props.class);
	const activeDescendantId = useProp(store.activeDescendantId);

	return <div
		ref={(element) => {
			if (element) store.setHighlightContainer(element);
			resolveProp(props.ref)?.(element);
		}}
		role="menu"
		aria-orientation="vertical"
		aria-label={label}
		aria-activedescendant={store.keyboardNavigation ? activeDescendantId : undefined}
		tabindex={store.keyboardNavigation ? -1 : undefined}
		class={cn('relative flex flex-col', className)}
		onPointerMove={() => store.notePointerMove()}
	>
		<div
			ref={(element) => {
				if (element) store.setHighlightRail(element);
			}}
			aria-hidden="true"
			class="pointer-events-none absolute opacity-0 transition-[top,left,width,height,opacity,border-radius] duration-75 ease-out bg-[var(--rg-surface-hover)]"
		/>
		{props.children}
	</div>;
};
