import {
	HotkeysProvider,
	useHotkey,
	useHotkeySequence,
	useHotkeys,
} from '@octanejs/tanstack-hotkeys';

export interface ShortcutProbeProps {
	onShortcut: () => void;
	enabled?: boolean;
}

export function ShortcutProbe(props: ShortcutProbeProps) @{
	useHotkey(
		'Control+K',
		props.onShortcut,
		props.enabled === undefined ? {} : { enabled: props.enabled },
	);

	<span id="shortcut-probe">Ready</span>
}

export function MultipleShortcutsProbe(props: {
	onFirst: () => void;
	onSecond: () => void;
}) @{
	useHotkeys([
		{ hotkey: 'Control+K', callback: props.onFirst },
		{ hotkey: 'Control+L', callback: props.onSecond },
	]);

	<span id="multiple-shortcuts-probe">Ready</span>
}

export function SequenceProbe(props: { onShortcut: () => void }) @{
	useHotkeySequence(['G', 'G'], props.onShortcut);

	<span id="sequence-probe">Ready</span>
}

export function DisabledProviderProbe(props: { onShortcut: () => void }) @{
	<HotkeysProvider defaultOptions={{ hotkey: { enabled: false } }}>
		<ShortcutProbe onShortcut={props.onShortcut} />
	</HotkeysProvider>
}
