import { useState } from 'octane';
import { mergeProps, useFocusWithin, useHover, useId, useKeyboard, usePress } from '@octanejs/aria';

// Differential fixtures: the SAME components run through @octanejs/aria (octane) and the
// real react-aria (React) — see tests/differential/_setup.ts. Interaction state surfaces
// as data-* attributes and rendered text so the HTML-only rig can see it.

export function PressLog() {
	const [log, setLog] = useState('');
	const { pressProps, isPressed } = usePress({
		onPressStart: () => setLog((l: string) => l + 's'),
		onPressEnd: () => setLog((l: string) => l + 'e'),
		onPress: () => setLog((l: string) => l + 'p'),
	});
	return <div
		id="press"
		role="button"
		tabIndex={0}
		{...pressProps}
		data-pressed={isPressed || undefined}
	>
		{'log:' + log}
	</div>;
}

export function HoverBadge() {
	const { hoverProps, isHovered } = useHover({});
	return <div id="hover" {...hoverProps} data-hovered={isHovered || undefined}>
		{'hovered:' + (isHovered ? 'yes' : 'no')}
	</div>;
}

export function FocusWithinBox() {
	const [within, setWithin] = useState(false);
	const [changes, setChanges] = useState(0);
	const { focusWithinProps } = useFocusWithin({
		onFocusWithinChange: (value: boolean) => {
			setWithin(value);
			setChanges((c: number) => c + 1);
		},
	});
	return <div>
		<div id="fw" {...focusWithinProps} data-focus-within={within || undefined}>
			<input id="fw-input" />
			{'changes:' + changes}
		</div>
		<input id="fw-outside" />
	</div>;
}

export function KeyEcho() {
	const [child, setChild] = useState('');
	const [parent, setParent] = useState('');
	const { keyboardProps } = useKeyboard({
		onKeyDown: (e: any) => setChild((c: string) => c + e.key),
	});
	const { keyboardProps: passProps } = useKeyboard({
		onKeyDown: (e: any) => {
			setChild((c: string) => c + e.key);
			e.continuePropagation();
		},
	});
	return <div onKeyDown={() => setParent((p: string) => p + '!')}>
		<input id="key-stop" {...keyboardProps} />
		<input id="key-pass" {...passProps} />
		<span>
			{'child:' + child + ' parent:' + parent}
		</span>
	</div>;
}

export function MergedIdsLabel() {
	const idA = useId();
	const idB = useId();
	const props = mergeProps({ id: idA }, { id: idB });
	return <div>
		<span id={idA} />
		<span id={idB} />
		<span {...props} />
	</div>;
}

// Pins upstream's createEventHandler flag semantics ACROSS dispatches of one wrapper
// instance: handlers log to module state (no re-render between keydowns, so useKeyboard's
// wrapper is not recreated), and a flush click renders the log. After a handler calls
// continuePropagation() for one event, upstream's wrapper does not re-arm stop-by-default
// for the next event — whatever the exact semantics, octane must match React byte-for-byte.
const keyLatchLog: string[] = [];
export function KeyLatch() {
	const [, force] = useState(0);
	const { keyboardProps } = useKeyboard({
		onKeyDown: (e: any) => {
			keyLatchLog.push('child:' + e.key);
			if (e.key === 'c') {
				e.continuePropagation();
			}
		},
	});
	return <div onKeyDown={(e: any) => keyLatchLog.push('parent:' + e.key)}>
		<input id="latch-input" {...keyboardProps} />
		<button id="latch-flush" onClick={() => force((n: number) => n + 1)}>
			flush
		</button>
		<output>{keyLatchLog.join(',')}</output>
	</div>;
}
