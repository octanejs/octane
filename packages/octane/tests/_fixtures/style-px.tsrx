// React-parity `px` behavior for numeric style-object values: a bare number gets
// `px` appended EXCEPT `0`, custom properties (`--x`), and the unitless set
// (opacity, zIndex, lineHeight, flex, …). Strings pass through untouched.

// Dynamic object style — goes through setStyle → applyStyleProperty at runtime.
export function DynStyle(props) @{
	<div id="d" style={props.s}>{'x'}</div>
}

// Static object literal — baked into the template HTML at compile time; must apply
// the SAME px + hyphenation rules as the dynamic path (and match on the server).
export function StaticStyle() @{
	<div
		id="s"
		style={{
			width: 100,
			opacity: 0.5,
			lineHeight: 2,
			marginTop: 0,
			zIndex: 3,
			backgroundColor: 'red',
		}}
	>{'x'}</div>
}
