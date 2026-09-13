/** @jsxImportSource octane */
import { useSyncExternalStore, type OctaneNode } from 'octane';
import { cn } from '../../utils/cn.js';
import { useMenuStore } from './menu-context.js';

interface MenuListProps {
	ref?: (element: HTMLDivElement) => void;
	class?: string;
	label?: string;
	children: OctaneNode;
}

export const MenuList = (props: MenuListProps) => {
	const store = useMenuStore();
	const activeDescendantId = useSyncExternalStore(store.subscribe, store.activeDescendantId);

	return (
		<div
			ref={(element) => {
				if (!element) return;
				store.setHighlightContainer(element);
				props.ref?.(element);
			}}
			role="menu"
			aria-orientation="vertical"
			aria-label={props.label}
			aria-activedescendant={store.keyboardNavigation ? activeDescendantId : undefined}
			tabindex={store.keyboardNavigation ? -1 : undefined}
			class={cn('relative flex flex-col', props.class)}
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
		</div>
	);
};
