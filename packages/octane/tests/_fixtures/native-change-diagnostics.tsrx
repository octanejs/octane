import { createElement, createPortal } from 'octane';

// Every host below intentionally defers its final event/type decision to the
// runtime. The tests exercise public JSX/render paths rather than diagnostic
// helper internals.

export function SpreadText(props) @{
	<input id="spread-text" {...props.hostProps} />
}

export function SpreadTextarea(props) @{
	<textarea id="spread-area" {...props.hostProps} />
}

export function StaticText() @{
	<input id="static-text" onChange={() => {}} />
}

export function MutableInputHandler(props) @{
	let handleInput: any = () => {};
	if (props.removeInput) handleInput = null;
	<input id="mutable-input-handler" onChange={() => {}} onInput={handleInput} />
}

export function SuppressedStaticText() @{
	<input id="suppressed-static-text" onChange={() => {}} suppressNativeChangeWarning />
}

export function ValueText(props) {
	return <input id="value-text" {...props.hostProps} />;
}

export function DynamicHost(props) @{
	const Host = props.host;
	<Host id="dynamic-host" {...props.hostProps} />
}

export function DirectCreateElement(props) {
	return createElement('input', { id: 'direct-create-element', ...props.hostProps });
}

export function NamespaceText(props) @{
	<svg>
		<input id="svg-input" {...props.hostProps} />
		<foreignObject>
			<input id="foreign-input" {...props.hostProps} />
		</foreignObject>
	</svg>
}

export function NegativeHosts(props) @{
	<section>
		<input id="checkbox" type="checkbox" {...props.hostProps} />
		<select id="select" {...props.hostProps}>
			<option>one</option>
		</select>
		<commit-input id="custom" {...props.hostProps} />
	</section>
}

export function PortalText(props) @{
	<div>{createPortal(<input id="portal-text" {...props.hostProps} />, props.target)}</div>
}
