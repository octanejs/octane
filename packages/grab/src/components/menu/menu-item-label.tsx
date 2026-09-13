/** @jsxImportSource octane */
import { cn } from '../../utils/cn.js';

interface MenuItemLabelProps {
	class?: string;
	textContent: string;
}

export const MenuItemLabel = (props: MenuItemLabelProps) => (
	<span class={cn('text-[13px] leading-4 font-sans font-medium', props.class)}>
		{props.textContent as string}
	</span>
);
