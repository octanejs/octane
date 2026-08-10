import {
	HotkeysProvider,
	useDefaultHotkeysOptions,
	useHeldKeyCodes,
	useHeldKeys,
	useHotkey,
	useHotkeyRecorder,
	useHotkeySequence,
	useHotkeySequenceRecorder,
	useHotkeys,
	useHotkeysContext,
	useKeyHold,
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

export function HeldStateProbe() @{
	const heldKeys = useHeldKeys();
	const heldCodes = useHeldKeyCodes();
	const shiftHeld = useKeyHold('Shift');

	<main id="held-state-probe">
		<output id="held-keys">{heldKeys.join(',') as string}</output>
		<output id="held-codes">{JSON.stringify(heldCodes) as string}</output>
		<output id="shift-held">{String(shiftHeld) as string}</output>
	</main>
}

export function RecorderProbe(props: {
	onRecord: (hotkey: string) => void;
	onSequence: (sequence: string[]) => void;
}) @{
	const recorder = useHotkeyRecorder({
		onRecord: function onRecord(hotkey) {
			props.onRecord(String(hotkey));
		},
	});
	const sequenceRecorder = useHotkeySequenceRecorder({
		onRecord: function onSequence(sequence) {
			props.onSequence(sequence.map(String));
		},
	});

	<main id="recorder-probe">
		<button
			id="start-hotkey-recorder"
			onClick={function onStartHotkey() {
				recorder.startRecording();
			}}
		>
			{'recording:' + recorder.isRecording}
		</button>
		<button
			id="start-sequence-recorder"
			onClick={function onStartSequence() {
				sequenceRecorder.startRecording();
			}}
		>
			{'sequenceRecording:' + sequenceRecorder.isRecording}
		</button>
		<output id="recorded-hotkey">
			{recorder.recordedHotkey ? String(recorder.recordedHotkey) : 'none'}
		</output>
	</main>
}

function ContextReader() @{
	const context = useHotkeysContext();
	const defaults = useDefaultHotkeysOptions();

	<main id="context-probe">
		<output id="has-context">{String(context !== null) as string}</output>
		<output id="default-enabled">{String(defaults.hotkey?.enabled === false) as string}</output>
	</main>
}

export function ContextProbe() @{
	<HotkeysProvider defaultOptions={{ hotkey: { enabled: false } }}>
		<ContextReader />
	</HotkeysProvider>
}
