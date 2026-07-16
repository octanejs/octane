import { useState } from 'octane';

export function ControlledTextInput(props) @{
	const [value, setValue] = useState(props.initialValue ?? 'Hello');
	<input
		id="controlled-text-input"
		type={props.type ?? 'text'}
		value={value}
		onInput={(event) => {
			props.onEvent(event);
			setValue(event.target.value);
		}}
	/>
}

export function ControlledTextarea(props) @{
	const [value, setValue] = useState(props.initialValue ?? 'Hello');
	<textarea
		id="controlled-textarea"
		value={value}
		onInput={(event) => {
			props.onEvent(event);
			setValue(event.target.value);
		}}
	/>
}

export function ControlledCheckbox(props) @{
	const [checked, setChecked] = useState(props.initialValue ?? true);
	<input
		id="controlled-checkbox"
		type="checkbox"
		checked={checked}
		onInput={(event) => {
			props.onEvent(event);
			setChecked(event.target.checked);
		}}
	/>
}

export function ControlledSelect(props) @{
	const [value, setValue] = useState(props.initialValue ?? 'Hello');
	<select
		id="controlled-select"
		value={value}
		onChange={(event) => {
			props.onEvent(event);
			setValue(event.target.value);
		}}
	>
		<option value="Hello">Hello</option>
		<option value="Goodbye">Goodbye</option>
	</select>
}
