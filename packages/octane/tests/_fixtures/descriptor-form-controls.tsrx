export function Controls(props) @{
	<form>
		<input id="text" {...props.input} onInput={props.onInput} />
		<textarea id="textarea" {...props.textarea} readOnly />
		<input id="checked" type="checkbox" {...props.checkbox} readOnly />
		<select id="select" {...props.select} onChange={props.onChange}>
			@for (const option of props.options; key option.id) {
				<option value={option.id} disabled={option.disabled}>{option.label}</option>
			}
		</select>
		<output>{(props.read?.() ?? 'ready') as string}</output>
	</form>
}
