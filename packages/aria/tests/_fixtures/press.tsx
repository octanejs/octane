import { useState } from 'octane';
import { usePress } from '../../src/interactions/usePress';
import { useLongPress } from '../../src/interactions/useLongPress';
import { useMove } from '../../src/interactions/useMove';
import { PressResponder } from '../../src/interactions/PressResponder';

// Fixtures surface press state via data-* attributes and log interaction events into
// rendered text, so tests observe only consumer-visible behavior.

function usePressLog(extra?: { isDisabled?: boolean }) {
	const [log, setLog] = useState<string[]>([]);
	const add = (entry: string) => setLog((l) => [...l, entry]);
	const { pressProps, isPressed } = usePress({
		...extra,
		onPressStart: (e) => add('pressstart:' + e.pointerType),
		onPressEnd: (e) => add('pressend:' + e.pointerType),
		onPressUp: (e) => add('pressup:' + e.pointerType),
		onPress: (e) => add('press:' + e.pointerType),
		onPressChange: (pressed) => add('change:' + pressed),
		onClick: () => add('click'),
	});
	return { log, pressProps, isPressed };
}

// usePress on a real <button>, logging the full event sequence.
export function PressButton() {
	const { log, pressProps, isPressed } = usePressLog();
	return (
		<button {...pressProps} data-testid="btn" data-pressed={isPressed ? 'true' : undefined}>
			{log.join(',') as string}
		</button>
	);
}

// Same surface with press events disabled: nothing may fire.
export function DisabledPressButton() {
	const { log, pressProps, isPressed } = usePressLog({ isDisabled: true });
	return (
		<button {...pressProps} data-testid="btn" data-pressed={isPressed ? 'true' : undefined}>
			{log.join(',') as string}
		</button>
	);
}

// useLongPress with a short threshold so real timers stay fast.
export function LongPressButton() {
	const [log, setLog] = useState<string[]>([]);
	const add = (entry: string) => setLog((l) => [...l, entry]);
	const { longPressProps } = useLongPress({
		threshold: 50,
		onLongPressStart: (e) => add('longpressstart:' + e.pointerType),
		onLongPressEnd: (e) => add('longpressend:' + e.pointerType),
		onLongPress: (e) => add('longpress:' + e.pointerType),
		accessibilityDescription: 'Long press to activate',
	});
	return (
		<button {...longPressProps} data-testid="btn">
			{log.join(',') as string}
		</button>
	);
}

// useMove on a focusable box; deltas are logged per move.
export function MoveBox() {
	const [log, setLog] = useState<string[]>([]);
	const add = (entry: string) => setLog((l) => [...l, entry]);
	const { moveProps } = useMove({
		onMoveStart: (e) => add('start:' + e.pointerType),
		onMove: (e) => add('move:' + e.pointerType + ':' + e.deltaX + ',' + e.deltaY),
		onMoveEnd: (e) => add('end:' + e.pointerType),
	});
	return (
		<div {...moveProps} tabIndex={0} data-testid="box">
			{log.join(';') as string}
		</div>
	);
}

// PressResponder provides press props via context; the pressable child registers and
// both the responder's and the child's own onPress fire.
function ResponderChild(props: { onEvent: (entry: string) => void }) {
	const { pressProps } = usePress({
		onPress: () => props.onEvent('child-press'),
	});
	return (
		<button {...pressProps} data-testid="btn">
			press me
		</button>
	);
}

export function ResponderCase() {
	const [log, setLog] = useState<string[]>([]);
	const add = (entry: string) => setLog((l) => [...l, entry]);
	return (
		<div>
			<PressResponder onPress={() => add('responder-press')}>
				<ResponderChild onEvent={add} />
			</PressResponder>
			<output data-testid="log">{log.join(',') as string}</output>
		</div>
	);
}
