// Fixture for CSSPropertyOperations-test.js ports — a single host with a
// dynamic object style so the test drives the runtime setStyle path (client)
// and the ssrStyle serializer (server) with arbitrary style objects.
export function StyleObj(props) @{
	<div id="so" style={props.s} />
}

export function MixedStyleObj(props) @{
	<div id="mixed-style-object" style={{ position: 'absolute', color: props.color }} />
}

export function StaticInvalidStyleObj() @{
	<div
		id="static-invalid-style-object"
		style={{ webkitStaticLiteralTransform: 'scale(1)', color: 'static-literal-warning;' }}
	/>
}

export function MixedInvalidStaticStyleObj(props) @{
	<div
		id="mixed-invalid-static-style-object"
		style={{ webkitMixedLiteralTransform: 'scale(1)', color: props.color }}
	/>
}

export function StaticInvalidHydrationStyleObj() @{
	<div
		id="static-invalid-hydration-style-object"
		style={{ webkitStaticHydrationTransform: 'scale(1)', color: 'blue' }}
	/>
}

export function MixedInvalidHydrationStyleObj(props) @{
	<div
		id="mixed-invalid-hydration-style-object"
		style={{ webkitMixedHydrationTransform: 'scale(1)', color: props.color }}
	/>
}
