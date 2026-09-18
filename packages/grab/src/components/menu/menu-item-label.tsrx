import { resolveProp, useProp, type Component } from '../../reactive.js';
import { cn } from '../../utils/cn.js';

interface MenuItemLabelProps {
	class?: string;
	textContent: string;
}

export const MenuItemLabel: Component<MenuItemLabelProps> = (props) => {
	const text = useProp(() => resolveProp(props.textContent));
	const className = useProp(
		() => cn('text-[13px] leading-4 font-sans font-medium', resolveProp(props.class)),
	);
	return <span class={className}>{text}</span>;
};
