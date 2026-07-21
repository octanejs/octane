// Minimal presentational fixtures for the render/rerender/cleanup ports.

export function Greeting(props) @{
	<div>{'Hello, ' + props.name + '!'}</div>
}

export function Message(props) @{
	<span data-testid="message">{props.text as string}</span>
}

export function OtherMessage(props) @{
	<p data-testid="other">{props.text as string}</p>
}

// `wrapper` render-option target — renders its children inside a landmark the
// tests can assert on (RTL's ParentComponent in render.js:93).
export function MainWrapper(props) @{
	<main data-testid="wrapper">{props.children}</main>
}
