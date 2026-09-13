/** @jsxImportSource octane */
import { isMac } from '../utils/is-mac.js';
import { IconCommand } from './icons/icon-command.jsx';
import { IconReturn } from './icons/icon-return.jsx';

interface ShortcutHintProps {
	shortcut: string;
	modifier?: boolean;
	class?: string;
}

export const ShortcutHint = (props: ShortcutHintProps) => {
	const isEnter = props.shortcut === 'Enter';
	const requiresModifier = props.modifier !== false;
	const isMacPlatform = isMac();

	return (
		<span class={props.class} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
			{isEnter ? (
				<IconReturn size={8} />
			) : requiresModifier ? (
				isMacPlatform ? (
					<>
						<IconCommand size={9} />
						<span>{props.shortcut as string}</span>
					</>
				) : (
					<span>{`Ctrl+${props.shortcut}` as string}</span>
				)
			) : (
				<span>{props.shortcut as string}</span>
			)}
		</span>
	);
};
