import { useState } from 'octane';
import { useControlledState } from '@octanejs/aria/stately';

// Uncontrolled: defaultValue seeds the state; the setter (direct value or functional
// updater) updates the rendered value.
export function UncontrolledCounter() {
	const [value, setValue] = useControlledState<number>(undefined, 5);
	return (
		<div>
			<button data-testid="set" onClick={() => setValue(value + 1)}>
				{'set'}
			</button>
			<button data-testid="fn" onClick={() => setValue((prev) => prev + 10)}>
				{'fn'}
			</button>
			<output>{'v:' + value}</output>
		</div>
	);
}

// Controlled with a frozen value: the controlled value keeps winning in the render,
// while onChange still fires with the value the setter produced.
export function ControlledFrozen() {
	const [log, setLog] = useState('none');
	const [state, setState] = useControlledState<number>(42, 0, (v: number) => setLog(String(v)));
	return (
		<div>
			<button onClick={() => setState(100)}>{'go'}</button>
			<output data-testid="value">{'s:' + state}</output>
			<output data-testid="log">{'log:' + log}</output>
		</div>
	);
}

// Controlled and parent-wired: onChange feeds the parent state back into `value`,
// so the rendered value follows the parent. The functional updater receives the
// current (controlled) value.
export function ControlledCounter() {
	const [value, setValue] = useState(10);
	const [state, setState] = useControlledState<number>(value, 0, (v: number) => setValue(v));
	return (
		<div>
			<button onClick={() => setState((prev) => prev + 1)}>{'inc'}</button>
			<output>{'s:' + state}</output>
		</div>
	);
}
