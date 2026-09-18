import { resolveProp, Show, useProp, type Component } from '../reactive.js';
import { isMac } from '../utils/is-mac.js';
import { IconCommand } from './icons/icon-command.tsrx';
import { IconReturn } from './icons/icon-return.tsrx';

interface ShortcutHintProps {
	shortcut: string;
	modifier?: boolean;
	class?: string;
}

export const ShortcutHint: Component<ShortcutHintProps> = (props) => {
	const isEnter = useProp(() => resolveProp(props.shortcut) === 'Enter');
	const requiresModifier = useProp(() => resolveProp(props.modifier) !== false);
	const shortcut = useProp(() => resolveProp(props.shortcut));
	const className = useProp(props.class);
	const isMacPlatform = isMac();

	return <span
		class={className}
		style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}
	>
		<Show when={() => isEnter}>
			<IconReturn size={8} />
		</Show>
		<Show when={() => !isEnter}>
			<Show when={() => requiresModifier} fallback={<span>{shortcut}</span>}>
				<Show when={() => isMacPlatform} fallback={<span>{`Ctrl+${shortcut}`}</span>}>
					<IconCommand size={9} />
					<span>{shortcut}</span>
				</Show>
			</Show>
		</Show>
	</span>;
};
