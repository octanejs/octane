// ============================================================================
// Controlled form component fixtures — ports of ReactDOMInput-test.js /
// ReactDOMSelect-test.js / ReactDOMTextarea-test.js /
// ReactControlledComponent-test.js slices (React v19.2.7).
//
// Controlled `value`/`checked` are SUPPORTED since 2026-07-08: React's
// controlled semantics on NATIVE events — `onInput` drives text controls
// per keystroke (there is no synthetic `onChange`; native `change` fires on
// blur/commit), and native `click`/`change` drive checkables/selects.
// ============================================================================
import { useState } from 'octane';

// Props-driven controlled input, NO handler — every edit must snap back.
export function ControlledInput(props) @{
	<input id="ci" value={props.value} onInput={props.onInput} />
}

// Stateful controlled input whose onInput ACCEPTS the edit.
export function AcceptingInput(props) @{
	const [v, setV] = useState(props.initial ?? '');
	<input id="ai" value={v} onInput={(e) => setV(e.target.value)} />
}

// Stateful controlled input whose onInput calls setState with the SAME value
// (Object.is bail — schedules no render; the restore pass must still revert).
export function BailingInput(props) @{
	const [v, setV] = useState(props.initial ?? 'locked');
	<input id="bi" value={v} onInput={() => setV(props.initial ?? 'locked')} />
}

// Filtered input: digits only survive.
export function DigitsInput() @{
	const [v, setV] = useState('');
	<input id="di" value={v} onInput={(e) => setV(e.target.value.replace(/\D+/g, ''))} />
}

// Number input — the loose-compare rule: rendered `1` vs DOM "1.0" must NOT
// clobber (the user is mid-edit); `0` vs "" must write.
export function NumberInput(props) @{
	<input id="ni" type="number" value={props.value} onInput={props.onInput} />
}

// Controlled checkbox; `accept` decides whether the click handler commits the
// platform toggle into state.
export function Checkbox(props) @{
	const [on, setOn] = useState(!!props.initial);
	<input
		id="cb"
		type="checkbox"
		checked={on}
		onClick={(e) => {
			if (props.accept) setOn(e.target.checked);
		}}
	/>
}

// Controlled radio group (one name, two radios) — a rejected pick must
// restore BOTH radios (the platform unchecks the group cousin natively).
export function RadioGroup(props) @{
	const [pick, setPick] = useState(props.initial ?? 'a');
	<div>
		<input
			id="ra"
			type="radio"
			name="rg"
			value="a"
			checked={pick === 'a'}
			onClick={() => {
				if (props.accept) setPick('a');
			}}
		/>
		<input
			id="rb"
			type="radio"
			name="rg"
			value="b"
			checked={pick === 'b'}
			onClick={() => {
				if (props.accept) setPick('b');
			}}
		/>
	</div>
}

// Controlled ↔ uncontrolled transitions (value passed straight through; a
// nullish value means uncontrolled, like React).
export function MaybeControlled(props) @{
	<input id="mc" value={props.value} />
}

// Uncontrolled with defaults (the escape hatch).
export function DefaultsInput(props) @{
	<input id="dvi" defaultValue={props.dv} />
}
// A spread can introduce a controlled value writer, so the following direct
// defaultValue must retain the full value/default cascade.
export function SpreadDefaultInput(props) @{
	<input id="sdi" {...props.sp} defaultValue={props.dv} />
}
export function DefaultsCheckbox(props) @{
	<input id="dci" type="checkbox" defaultChecked={props.dc} />
}

// Controlled select over STATIC options (projection at binding time).
export function StaticSelect(props) @{
	<select id="ss" value={props.value} onInput={props.onInput}>
		<option value="a">A</option>
		<option value="b">B</option>
		<option value="c">C</option>
	</select>
}

export function CaptureSelect(props) @{
	<select
		id="cs"
		value={props.value}
		onChangeCapture={props.onChangeCapture}
		onChange={props.onChange}
	>
		<option value="a">A</option>
		<option value="b">B</option>
		<option value="c">C</option>
	</select>
}

// No-match fallback: the FIRST NON-DISABLED option wins (React updateOptions).
export function DisabledFirstSelect(props) @{
	<select id="dfs" value={props.value}>
		<option value="x" disabled>X</option>
		<option value="y">Y</option>
		<option value="z">Z</option>
	</select>
}

// Options built by @for — they don't exist yet when the select's value
// binding mounts, so the COMMIT-deferred projection is what lands this.
export function ForSelect(props) @{
	<select id="fs" value={props.value}>
		@for (const o of props.options; key o) {
			<option value={o}>{o}</option>
		}
	</select>
}

// Controlled multiple select (value is an array).
export function MultiSelect(props) @{
	<select id="ms" multiple value={props.values}>
		<option value="1">1</option>
		<option value="2">2</option>
		<option value="3">3</option>
	</select>
}

// Uncontrolled select with defaultValue (one-shot-per-change projection with
// defaultSelected stamped).
export function DefaultSelect(props) @{
	<select id="dsl" defaultValue={props.dv}>
		<option value="p">P</option>
		<option value="q">Q</option>
	</select>
}

// Controlled textarea (the prop owns the content; children are a compile error).
export function ControlledTextarea(props) @{
	<textarea id="ta" value={props.value} onInput={props.onInput} />
}
export function DefaultTextarea(props) @{
	<textarea id="dta" defaultValue={props.dv} />
}

// Spread-delivered controlled value — exercises the setAttribute routing arm
// (spreads bypass the compiler's controlled classification).
export function SpreadInput(props) @{
	<input id="si" {...props.sp} />
}

// A controlled checkbox inside a <form> — the `checked` ATTRIBUTE mirrors only
// the INITIAL state, so a native form.reset() restores that initial state and
// octane-driven resets (requestFormReset / a successful <form action={fn}>)
// must REASSERT the current rendered state afterwards.
export function ControlledForm(props) @{
	<form>
		<input id="cf" type="checkbox" checked={props.on} onClick={props.onClick} />
	</form>
}
