import { useCallback, useState, useState as useOctaneState } from 'octane';

export function Classed(props) @{
	<div class={props.kind}>{'x'}</div>
}

export function WithAttrs(props) @{
	<a href={props.url} title={props.title}>{'link'}</a>
}

export function StringDataAttribute(props) @{
	<div id="string-data" data-label={'' + props.value}>{'data'}</div>
}

export function RuntimeTypedDataAttribute(props) @{
	<div id="runtime-data" data-label={props.value as string}>{'data'}</div>
}

export function DynamicAriaAttribute(props) @{
	<div id="dynamic-aria" aria-label={props.value}>{'aria'}</div>
}

export function Clicker() @{
	const [n, setN] = useState(0);
	<button onClick={() => setN(n + 1)}>
		{n as string}
	</button>
}

export function DoubleClicker() @{
	const [n, setN] = useState(0);
	<button onDoubleClick={() => setN(n + 1)}>
		{n as string}
	</button>
}

export function SpreadDoubleClicker() @{
	const [n, setN] = useState(0);
	const props = { onDoubleClick: () => setN(n + 1) };
	<button {...props}>
		{n as string}
	</button>
}

export function EventAfterSpread() @{
	const [n, setN] = useState(0);
	const attrs = { onClick: () => setN((value) => value + 100) };
	const increment = () => setN((value) => value + 1);
	<button {...attrs} onClick={increment}>
		{n as string}
	</button>
}

export function DuplicateEventWriters() @{
	const [n, setN] = useState(0);
	const increment = () => setN((value) => value + 1);
	<button onClick={() => setN(n + 100)} onClick={increment}>
		{n as string}
	</button>
}

export function ReassignedEventHandler() @{
	const [n, setN] = useState(0);
	let handler = () => setN(n + 1);
	if (n > 0) handler = () => setN(n + 10);
	<button onClick={handler}>
		{n as string}
	</button>
}

export function ShadowedHookFactory() @{
	const [n, setN] = useOctaneState(0);
	// This is an ordinary local factory, not the imported hook. Its update
	// closure is deliberately fresh each render and captures the current value.
	const useState = () => [n, () => setN(n + 1)];
	const [, update] = useState();
	const handler = () => update();
	<button id="shadowed-hook" onClick={handler}>
		{n as string}
	</button>
}

export function RegexCallbackDependency() @{
	const [n, setN] = useState(0);
	const handler = useCallback(() => setN(n + 1), [/x/]);
	<button onClick={handler}>
		{n as string}
	</button>
}

export function RegexEventArgument() @{
	const [n, setN] = useState(0);
	const run = (pattern) => setN((value) => value + (pattern.test('x') ? 1 : 100));
	<button onClick={() => run(/x/g)}>
		{n as string}
	</button>
}

export function StableNativeEventCallbacks(props) @{
	const [n, setN] = useState(0);
	const increment = () => setN((value) => value + 1);
	const addTen = () => setN((value) => value + 10);
	const observed = () => setN((value) => value + 100);
	props.observe(observed);
	<div>
		<button id="increment" onClick={increment}>{'increment'}</button>
		<button id="add-ten-a" onClick={addTen}>{'add ten a'}</button>
		<button id="add-ten-b" onClick={() => addTen()}>{'add ten b'}</button>
		<button id="observed" onClick={observed}>{'observed'}</button>
		<output>
			{n as string}
		</output>
	</div>
}

export function FnSetter() @{
	const [n, setN] = useState(0);
	<button
		onClick={() => {
			setN((c) => c + 1);
			setN((c) => c + 1);
			setN((c) => c + 1);
		}}
	>
		{n as string}
	</button>
}

// `aria-*` is ENUMERATED (React parity): boolean LITERALS must bake as the
// strings "true"/"false" in the static template fast path — matching the
// runtime setAttribute / ssrAttr handling of dynamic values.
export function AriaStaticLiterals() @{
	<div
		id="aria-host"
		aria-hidden={false}
		aria-expanded={true}
		aria-label="lbl"
		hidden={false}
	>{'aria'}</div>
}
