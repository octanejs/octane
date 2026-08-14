// React controlled-form diagnostics: retain the supported native form behavior
// while exposing contradictory authoring through development-only warnings.

export function ConflictingInput(props) @{
	<input
		id="form-conflict-input"
		type={props.type ?? 'text'}
		value={props.value}
		defaultValue={props.defaultValue}
		readOnly
	/>
}

export function ConflictingCheckbox(props) @{
	<input
		id="form-conflict-checkbox"
		type={props.type ?? 'checkbox'}
		checked={props.checked}
		defaultChecked={props.defaultChecked}
		readOnly
	/>
}

export function ConflictingTextarea(props) @{
	<textarea
		id="form-conflict-textarea"
		value={props.value}
		defaultValue={props.defaultValue}
		readOnly
	/>
}

export function ConflictingSelect(props) @{
	<select id="form-conflict-select" value={props.value} defaultValue={props.defaultValue} readOnly>
		<option value="first">first</option>
		<option value="second">second</option>
	</select>
}

export function SpreadInput(props) @{
	<input id="form-conflict-spread" {...props.attributes} readOnly />
}

export function SpreadTextarea(props) @{
	<textarea id="form-conflict-spread-textarea" {...props.attributes} readOnly />
}

export function SpreadSelect(props) @{
	<select id="form-conflict-spread-select" {...props.attributes} readOnly>
		<option value="first">first</option>
		<option value="second">second</option>
	</select>
}

export function TextareaChildren(props) @{
	<textarea id="form-textarea-children">{props.children as string}</textarea>
}

export function SelectedOption(props) @{
	<select id="form-selected-option">
		<option value="first" selected={props.selected}>first</option>
		<option value="second">second</option>
	</select>
}

export function StaticSelectedOption() @{
	<select id="form-static-selected-option">
		<option value="first" selected>first</option>
	</select>
}

function OptionLabel(props) @{
	<span>{props.label as string}</span>
}

export function ComplexOptionChildren(props) @{
	<select id="form-complex-option">
		<option>
			<OptionLabel label={props.label} />
		</option>
	</select>
}

export function ValuedComplexOptionChildren(props) @{
	<select id="form-valued-complex-option">
		<option value="explicit">
			<OptionLabel label={props.label} />
		</option>
	</select>
}

export function FunctionActionForm(props) @{
	<form
		id="form-function-action"
		action={props.action}
		method={props.method}
		encType={props.encType}
		target={props.target}
	>
		<button type="submit">submit</button>
	</form>
}

export function FunctionActionButton(props) @{
	<form>
		<button
			id="form-function-button"
			type={props.type}
			formAction={props.action}
			name={props.name}
			formMethod={props.formMethod}
			formEncType={props.formEncType}
			formTarget={props.formTarget}
		>
			submit
		</button>
	</form>
}

export function FunctionActionInput(props) @{
	<form>
		<input
			id="form-function-input"
			type={props.type}
			formAction={props.action}
			name={props.name}
			formMethod={props.formMethod}
			formEncType={props.formEncType}
			formTarget={props.formTarget}
		/>
	</form>
}

export function StaticFunctionActionForm(props) @{
	<form id="form-static-function-action" action={props.action} method="post" target="_blank">
		<button type="submit">submit</button>
	</form>
}

export function StaticFunctionActionInput(props) @{
	<form>
		<input id="form-static-function-input" type="submit" formAction={props.action} />
	</form>
}

export function SpreadFunctionActionForm(props) @{
	<form id="form-spread-function-action" {...props.attributes}>
		<button type="submit">submit</button>
	</form>
}

export function SpreadFunctionActionInput(props) @{
	<form>
		<input id="form-spread-function-input" {...props.attributes} />
	</form>
}
