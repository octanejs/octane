import { useState, useRef } from 'octane';
import { useHotkey, useHotkeySequence, useHotkeys } from '@octanejs/tanstack-hotkeys';

export function HotkeysParity() {
	const rootRef = useRef<HTMLElement | null>(null);
	const [single, setSingle] = useState(0);
	const [first, setFirst] = useState(0);
	const [second, setSecond] = useState(0);
	const [sequence, setSequence] = useState(0);
	const [enabled, setEnabled] = useState(true);

	useHotkey('Control+K', function onSingle() {
		setSingle(function increment(value: number) {
			return value + 1;
		});
	}, { enabled, target: rootRef });
	useHotkeys(
		[
			{
				hotkey: 'Control+L',
				callback: function onFirst() {
					setFirst(function increment(value: number) {
						return value + 1;
					});
				},
			},
			{
				hotkey: 'Alt+X',
				callback: function onSecond() {
					setSecond(function increment(value: number) {
						return value + 1;
					});
				},
			},
		],
		{ target: rootRef },
	);
	useHotkeySequence(
		['G', 'G'],
		function onSequence() {
			setSequence(function increment(value: number) {
				return value + 1;
			});
		},
		{ target: rootRef },
	);

	return (
		<main id="hotkeys-parity" ref={rootRef}>
			<button
				id="toggle"
				onClick={function onToggle() {
					setEnabled(function toggle(value: boolean) {
						return !value;
					});
				}}
			>
				{'enabled:' + enabled}
			</button>
			<output id="single">{'single:' + single}</output>
			<output id="first">{'first:' + first}</output>
			<output id="second">{'second:' + second}</output>
			<output id="sequence">{'sequence:' + sequence}</output>
		</main>
	);
}
