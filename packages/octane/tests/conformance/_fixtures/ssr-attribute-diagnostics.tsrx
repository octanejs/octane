export function AttributeDiagnostics() @{
	const notANumber = Number.NaN;
	const handler = () => {};
	const token = Symbol('attribute');
	const plainObject = {};
	const meaningfulObject = {
		toString() {
			return 'meaningful';
		},
	};
	<main id="attribute-diagnostics">
		<div id="boolean-true" title data-ready aria-hidden hidden />
		<div id="boolean-false" alt={false} />
		<div id="nan" width={notANumber} />
		<div id="function" height={handler} />
		<div id="symbol" lang={token} />
		<div id="plain-object" dir={plainObject} />
		<div id="meaningful-object" translate={meaningfulObject} />
		<div id="lowercase-event" onclick={handler} />
		<div id="repeated-function" height={handler} />
	</main>
}

export function CustomElementDiagnostics() @{
	const truthy = Boolean(1);
	const falsy = Boolean(0);
	const notANumber = Number.NaN;
	const handler = () => {};
	const token = Symbol('attribute');
	const plainObject = {};
	const meaningfulObject = {
		toString() {
			return 'meaningful';
		},
	};
	<custom-element
		id="custom-attribute-diagnostics"
		true-value={truthy}
		false-value={falsy}
		nan-value={notANumber}
		function-value={handler}
		symbol-value={token}
		object-value={plainObject}
		meaningful-value={meaningfulObject}
		onclick={handler}
	/>
}

export function SpreadAttributeDiagnostics(props: { attributes: Record<string, unknown> }) @{
	<div id="spread-attribute-diagnostics" {...props.attributes} />
}

export function NativeImageAttributes(props: {
	fetchpriority: 'high' | 'low' | 'auto';
	srcset: string;
	referrerpolicy: 'no-referrer' | 'origin';
	attributes: Record<string, unknown>;
}) @{
	<main>
		<img
			id="static-native-image"
			fetchpriority="low"
			srcset="/synthetic.svg 1x, /synthetic.svg 2x"
			referrerpolicy="no-referrer"
		/>
		<img
			id="dynamic-native-image"
			fetchpriority={props.fetchpriority}
			srcset={props.srcset}
			referrerpolicy={props.referrerpolicy}
		/>
		<img
			id="canonical-image"
			fetchPriority={props.fetchpriority}
			srcSet={props.srcset}
			referrerPolicy={props.referrerpolicy}
		/>
		<img id="spread-native-image" {...props.attributes} />
	</main>
}

export function SvgAttributeDiagnostics(props: { attributes: Record<string, unknown> }) @{
	<svg id="svg-attribute-diagnostics" {...props.attributes} />
}

export function HeadAttributeDiagnostics(props: { handler: () => void; truthy: boolean }) @{
	<>
		<meta
			name="ssr-attribute-diagnostics"
			content={props.handler}
			headflag={props.truthy}
			onheadclick={props.handler}
		/>
		<main id="head-attribute-diagnostics" />
	</>
}
