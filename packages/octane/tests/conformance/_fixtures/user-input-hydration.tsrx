// Fixtures for the "hydration must not blow away user input" conformance port
// (ReactDOMServerIntegrationUserInteraction-test.js). Since 2026-07-08 octane
// has REAL controlled components — `value`/`checked` on form controls are
// controlled props (React semantics on native events) and
// `defaultValue`/`defaultChecked` are the uncontrolled escape hatch. The
// uncontrolled fixtures below therefore use the default* props; the
// controlled fixtures pin the React-parity hydration policy: ADOPT the
// server DOM without writes (pre-hydration input survives), then the first
// real commit / first discrete event reasserts the rendered value.

// Uncontrolled text input (Per :297).
export function TextInput(props) @{
	<input id="fi" defaultValue="Hello" />
}

// CONTROLLED text input (value binding arms at hydration mount, zero writes).
export function DynamicTextInput(props) @{
	<input id="fi" value={props.v} onInput={props.onInput} />
}

// Uncontrolled range input (Per :310).
export function RangeInput(props) @{
	<input id="fi" type="range" defaultValue="0.5" />
}

// Uncontrolled checkbox (Per :333).
export function Checkbox(props) @{
	<input id="fi" type="checkbox" defaultChecked />
}

// CONTROLLED checkbox.
export function ControlledCheckbox(props) @{
	<input id="fi" type="checkbox" checked={props.c} onClick={props.onClick} />
}

// Textarea with native default text (Per :355) — plain children ARE the
// platform's defaultValue; only value/defaultValue PROPS make it controlled.
export function TextArea(props) @{
	<textarea id="fi">Hello</textarea>
}

// Select with a default-selected option (Per :367) — uncontrolled (no value
// prop); the static `selected` attribute is the native default.
export function Select(props) @{
	<select id="fi">
		<option value="Hello" selected>Hello</option>
		<option value="Goodbye">Goodbye</option>
	</select>
}
