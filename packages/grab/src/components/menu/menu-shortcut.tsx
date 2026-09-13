/** @jsxImportSource octane */
import { cn } from '../../utils/cn.js';
import { ShortcutHint } from '../shortcut-hint.js';

interface MenuShortcutProps {
	shortcut: string;
	modifier?: boolean;
	class?: string;
}

export const MenuShortcut = (props: MenuShortcutProps) => (
	<ShortcutHint
		shortcut={props.shortcut}
		modifier={props.modifier}
		class={cn('text-[11px] font-sans text-[var(--rg-text-secondary)] ml-4', props.class)}
	/>
);
