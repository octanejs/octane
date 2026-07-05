// Fixture for CSSPropertyOperations-test.js ports — a single host with a
// dynamic object style so the test drives the runtime setStyle path (client)
// and the ssrStyle serializer (server) with arbitrary style objects.
export function StyleObj(props) @{
	<div id="so" style={props.s} />
}
