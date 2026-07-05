// Fixtures for dom-component-children.test.ts — dangerouslySetInnerHTML value
// matrix, text-child ↔ empty transitions, and whitespace preservation.

// Dynamic __html value — the compiler's htmlOnlyChild fast path (only child, no
// spread): `el.innerHTML = (_v == null ? '' : String(_v))`.
export function DangerValue(props) @{
	<div id="dv" dangerouslySetInnerHTML={{ __html: props.h }} />
}

// Renderable text hole as the only child — text → null/undefined/false transitions.
export function TextHole(props) @{
	<div id="th">{props.v}</div>
}

// No children, no bindings — a re-render must not touch manually-set innerHTML.
export function PlainDiv() @{
	<div id="pd" />
}
