// Same-source native-event evidence fixture. Every export is compiled through
// both Octane and @tsrx/react; tests pass a recorder callback that snapshots
// public event fields without scheduling additional framework work.
import { useState } from 'octane';

export function TextTimeline(props) @{
	<input
		id="matrix-text"
		defaultValue="seed"
		onInputCapture={(event) => props.record('input:capture', event)}
		onInput={(event) => props.record('input:bubble', event)}
		onChangeCapture={(event) => props.record('change:capture', event)}
		onChange={(event) => props.record('change:bubble', event)}
	/>
}

// State is intentionally accepted only by onChange. The onInput observer is
// present solely to record the native input boundary and does not update state.
export function TextControlledByChange(props) @{
	const [value, setValue] = useState('seed');
	<section>
		<input
			id="matrix-controlled-change"
			value={value}
			onInput={(event) => props.record('input', event)}
			onChange={(event) => {
				props.record('change', event);
				setValue(event.target.value);
			}}
		/>
		<output>{value as string}</output>
	</section>
}

export function TextControlledByInput(props) @{
	const [value, setValue] = useState('seed');
	<section>
		<input
			id="matrix-controlled-input"
			value={value}
			onInput={(event) => {
				props.record('input', event);
				setValue(event.target.value);
			}}
			onChange={(event) => props.record('change', event)}
		/>
		<output>{value as string}</output>
	</section>
}

export function TextareaTimeline(props) @{
	<textarea
		id="matrix-textarea"
		defaultValue="seed"
		onInputCapture={(event) => props.record('input:capture', event)}
		onInput={(event) => props.record('input:bubble', event)}
		onChangeCapture={(event) => props.record('change:capture', event)}
		onChange={(event) => props.record('change:bubble', event)}
	/>
}

export function SelectTimeline(props) @{
	const [value, setValue] = useState('a');
	<section>
		<select
			id="matrix-select"
			value={value}
			onInputCapture={(event) => props.record('input:capture', event)}
			onInput={(event) => props.record('input:bubble', event)}
			onChangeCapture={(event) => props.record('change:capture', event)}
			onChange={(event) => {
				props.record('change:bubble', event);
				setValue(event.target.value);
			}}
		>
			<option value="a">A</option>
			<option value="b">B</option>
		</select>
		<output>{value as string}</output>
	</section>
}

export function CheckboxTimeline(props) @{
	const [checked, setChecked] = useState(false);
	<section>
		<input
			id="matrix-checkbox"
			type="checkbox"
			checked={checked}
			onClick={(event) => props.record('click', event)}
			onInput={(event) => props.record('input', event)}
			onChange={(event) => {
				props.record('change', event);
				setChecked(event.target.checked);
			}}
		/>
		<output>
			{checked ? 'checked' : 'clear'}
		</output>
	</section>
}

export function CheckboxPreventChange(props) @{
	<input
		id="matrix-checkbox-prevent"
		type="checkbox"
		onClick={(event) => props.record('click', event)}
		onInput={(event) => props.record('input', event)}
		onChange={(event) => {
			props.record('change:before', event);
			event.preventDefault();
			props.record('change:after', event);
		}}
	/>
}

export function CheckboxPreventClick(props) @{
	<input
		id="matrix-checkbox-prevent-click"
		type="checkbox"
		onClick={(event) => {
			props.record('click:before', event);
			event.preventDefault();
			props.record('click:after', event);
		}}
		onInput={(event) => props.record('input', event)}
		onChange={(event) => props.record('change', event)}
	/>
}

export function CheckboxPreventClickAccept(props) @{
	const [checked, setChecked] = useState(false);
	<section>
		<input
			id="matrix-checkbox-prevent-click-accept"
			type="checkbox"
			checked={checked}
			readOnly
			onClick={(event) => {
				props.record('click:before', event);
				setChecked(true);
				event.preventDefault();
				props.record('click:after', event);
			}}
		/>
		<output>
			{checked ? 'checked' : 'clear'}
		</output>
	</section>
}

export function RadioAccept(props) @{
	const [value, setValue] = useState('a');
	<form>
		<input
			id="matrix-radio-a"
			type="radio"
			name="matrix-radio"
			value="a"
			checked={value === 'a'}
			onClick={(event) => props.record('a:click', event)}
			onInput={(event) => props.record('a:input', event)}
			onChange={(event) => {
				props.record('a:change', event);
				setValue('a');
			}}
		/>
		<input
			id="matrix-radio-b"
			type="radio"
			name="matrix-radio"
			value="b"
			checked={value === 'b'}
			onClick={(event) => props.record('b:click', event)}
			onInput={(event) => props.record('b:input', event)}
			onChange={(event) => {
				props.record('b:change', event);
				setValue('b');
			}}
		/>
		<output>{value as string}</output>
	</form>
}

export function RadioReject(props) @{
	const [value] = useState('a');
	<form>
		<input
			id="matrix-radio-reject-a"
			type="radio"
			name="matrix-radio-reject"
			value="a"
			checked={value === 'a'}
			onClick={(event) => props.record('a:click', event)}
			onInput={(event) => props.record('a:input', event)}
			onChange={(event) => props.record('a:change', event)}
		/>
		<input
			id="matrix-radio-reject-b"
			type="radio"
			name="matrix-radio-reject"
			value="b"
			checked={value === 'b'}
			onClick={(event) => props.record('b:click', event)}
			onInput={(event) => props.record('b:input', event)}
			onChange={(event) => props.record('b:change', event)}
		/>
		<output>{value as string}</output>
	</form>
}

export function RadioPreventChange(props) @{
	<input
		id="matrix-radio-prevent-change"
		type="radio"
		onClick={(event) => props.record('click', event)}
		onInput={(event) => props.record('input', event)}
		onChange={(event) => {
			props.record('change:before', event);
			event.preventDefault();
			props.record('change:after', event);
		}}
	/>
}

export function RadioPreventClick(props) @{
	<form>
		<input
			id="matrix-radio-prevent-click-a"
			type="radio"
			name="matrix-radio-prevent-click"
			value="a"
			defaultChecked
			onClick={(event) => props.record('a:click', event)}
			onInput={(event) => props.record('a:input', event)}
			onChange={(event) => props.record('a:change', event)}
		/>
		<input
			id="matrix-radio-prevent-click-b"
			type="radio"
			name="matrix-radio-prevent-click"
			value="b"
			onClick={(event) => {
				props.record('b:click:before', event);
				event.preventDefault();
				props.record('b:click:after', event);
			}}
			onInput={(event) => props.record('b:input', event)}
			onChange={(event) => props.record('b:change', event)}
		/>
	</form>
}

export function CompositionTimeline(props) @{
	const [value, setValue] = useState('seed');
	<section>
		<input
			id="matrix-composition"
			value={value}
			onCompositionStart={(event) => props.record('compositionstart', event)}
			onCompositionUpdate={(event) => props.record('compositionupdate', event)}
			onCompositionEnd={(event) => props.record('compositionend', event)}
			onInput={(event) => {
				props.record('input', event);
				setValue(event.target.value);
			}}
			onChange={(event) => props.record('change', event)}
		/>
		<output>{value as string}</output>
	</section>
}
