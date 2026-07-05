// Fixtures for dom-component-styles.test.ts — ports of ReactDOMComponent-test.js
// (updateDOM describe) className/style update behaviors. Each fixture exposes one
// dynamic surface driven by props so the test exercises create + update + clear
// through mount()/update().

// className foo → bar → null + style co-located (the React test flips between
// style-only and className-only renders on the same <div>).
export function ClassAndStyle(props) @{
	<div id="cs" class={props.cls} style={props.s} />
}

// Bare dynamic style object — the setStyle object↔object/string/null diff paths.
export function StyledDiv(props) @{
	<div id="sd" style={props.s} />
}

// <span style={…}> — used by the Temporal-like coercion-throw port.
export function StyledSpan(props) @{
	<span id="sp" style={props.s} />
}
