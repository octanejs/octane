// ============================================================================
// DOM attribute matrix fixtures — ports of ReactDOMAttribute-test.js +
// DOMPropertyOperations-test.js (+ the empty-string src/href/action core from
// ReactDOMComponent-test.js). Each fixture exposes ONE dynamic surface driven
// by props so the test can exercise both the create (mount) and update
// (re-render) paths. Spread fixtures exercise the setSpread removal loop —
// the only client path where a previously-present prop can VANISH.
// ============================================================================

// Unknown attribute via a direct dynamic binding (runtime setAttribute path).
export function UnknownAttr(props) @{
	<div id="u" unknown={props.value} />
}

// Unknown attribute via spread — exercises setSpread's set + removal loops
// (a key present last render and absent this render routes removeHostProp).
export function UnknownSpread(props) @{
	<div id="us" {...props.sp} />
}

// Invalid static booleans must still reach the DEV property validator. The
// production compiler may fold both away because neither value serializes.
export function StaticInvalidBooleans() @{
	<div id="static-invalid-booleans" title alt={false} data-ready aria-hidden hidden />
}

// New-ish boolean attribute (React 19 knows `inert` as boolean).
export function BoolInert(props) @{
	<div id="bi" inert={props.v} />
}

// Classic boolean attribute on a form control.
export function BoolDisabled(props) @{
	<button id="bd" disabled={props.v} />
}

// Overloaded boolean (`download`): true → bare attr, false → removed,
// string → the string.
export function DownloadAttr(props) @{
	<a id="dl" href="#x" download={props.v}>{'dl'}</a>
}

// Boolean attribute spelled camelCase (HTML lowercases the DOM name).
export function AllowFullScreen(props) @{
	<iframe id="ifs" allowFullScreen={props.v} />
}

// data-* custom attribute.
export function DataFoo(props) @{
	<div id="df" data-foo={props.v} />
}

// `hidden` boolean.
export function HiddenAttr(props) @{
	<div id="hd" hidden={props.v} />
}

// Reflected string attribute (`title` — DOM property mirrors the attribute).
export function TitleAttr(props) @{
	<div id="ti" title={props.v} />
}

// Attribute-only prop (`role`).
export function RoleAttr(props) @{
	<div id="ro" role={props.v} />
}

// className that can go null.
export function ClassNullable(props) @{
	<div id="cl" className={props.cls} />
}

// <progress value> — attribute-only in React (never the .value property).
export function ProgressValue(props) @{
	<progress id="pv" value={props.v} />
}

// <option value=""> keeps the empty attribute; valueless option falls back to text.
export function OptionValues() @{
	<select id="sel">
		<option value="">empty</option>
		<option>filled</option>
	</select>
}

// Uncontrolled input with a dynamic value ATTRIBUTE (octane never writes .value).
export function InputEmptyValue(props) @{
	<input id="iv" value={props.v} />
}

// Enumerated attribute (React stringifies true/false to "true"/"false").
export function SpellCheck(props) @{
	<div id="sc" spellCheck={props.v} />
}

// Empty-string url-attribute policy (React 19: img src="" removed + warn).
export function ImgSrc(props) @{
	<img id="im" src={props.src} />
}

export function LinkHref(props) @{
	<link id="ln" rel="stylesheet" href={props.href} />
}

export function AnchorHref(props) @{
	<a id="an" href={props.href}>{'x'}</a>
}

export function FormAction(props) @{
	<form id="fa" action={props.action} />
}

// ---------------------------------------------------------------------------
// Custom elements.
// ---------------------------------------------------------------------------

// Dynamic prop on a custom element → attribute pass-through.
export function CustomElFoo(props) @{
	<my-custom-element id="ce" foo={props.foo} />
}

// Static attribute on a custom component tag.
export function CustomElStatic() @{
	<my-icon id="mi" size="5px" />
}

// Lowercase on* props with non-function values → plain attributes.
export function CustomElOnAttrs(props) @{
	<my-custom-element
		id="ceoa"
		onstring={props.onstring}
		onobj={props.onobj}
		onarray={props.onarray}
		ontrue={props.ontrue}
		onfalse={props.onfalse}
	/>
}

// Lowercase on* prop with a FUNCTION value — React attaches a `customevent`
// listener on custom elements; octane routes it to setAttribute (GAP pin).
export function CustomElCustomEvent(props) @{
	<my-custom-element id="cel" oncustomevent={props.handler} />
}

// Regular delegated onClick on a custom element.
export function CustomElClick(props) @{
	<my-custom-element id="cec" onClick={props.onClick}>{'hit'}</my-custom-element>
}

// Native onChange / onInput handlers on a custom element (removable via props).
export function CustomElChangeInput(props) @{
	<my-custom-element id="cci" onChange={props.onChange} onInput={props.onInput} />
}

// `autoFocus` (React parity, 2026-07-08): never an attribute — the element is
// focused in the commit phase of its mount; later changes are ignored.
export function AutoFocusInput(props) @{
	<input id="afi" autoFocus={props.v} />
}
export function AutoFocusBare(props) @{
	<input id="afb" autoFocus />
}
