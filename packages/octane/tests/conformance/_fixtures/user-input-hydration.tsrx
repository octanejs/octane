// Fixtures for the "hydration must not blow away user input" conformance port
// (ReactDOMServerIntegrationUserInteraction-test.js). Octane has no controlled components —
// value/checked are plain native attributes — so each element type is a single native form.
// The test types into the server-rendered field (setting its .value/.checked PROPERTY) BEFORE
// hydrating, then asserts hydration adopts the same node and does not reset the property.

// Text input with a default value (Per :297 uncontrolled input).
export function TextInput(props) @{
	<input id="fi" value="Hello" />
}

// Text input whose value is DYNAMIC (a binding runs at hydration mount).
export function DynamicTextInput(props) @{
	<input id="fi" value={props.v} />
}

// Range input with a default value (Per :310).
export function RangeInput(props) @{
	<input id="fi" type="range" value="0.5" />
}

// Checkbox, default checked (Per :333).
export function Checkbox(props) @{
	<input id="fi" type="checkbox" checked />
}

// Textarea with default text (Per :355).
export function TextArea(props) @{
	<textarea id="fi">Hello</textarea>
}

// Select with a default-selected option (Per :367).
export function Select(props) @{
	<select id="fi">
		<option value="Hello" selected>Hello</option>
		<option value="Goodbye">Goodbye</option>
	</select>
}
