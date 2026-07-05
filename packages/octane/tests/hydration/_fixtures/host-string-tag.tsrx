// Member-expression JSX tags whose RUNTIME value is a host tag STRING — the MDX
// shape (`<_components.h1>` reading off a components mapping whose defaults are
// strings). Value-position (.tsx return) bodies: the client value-lowers the tag
// to a `createElement(obj.tag, …)` descriptor (de-opt host path); the server's
// `ssrComponent` routes the string to the host serializer in the same
// single-block shape, so hydration adopts identically either way.

export function Doc(props) {
	return <>
		<props.components.h1 class="title">{props.title}</props.components.h1>
		<props.components.p>body text</props.components.p>
	</>;
}

// The same call site can resolve to a real COMPONENT at runtime (an MDX
// components-mapping override) — dispatch must stay dynamic on both sides.
function Fancy(props) {
	return <em class="fancy">{props.children}</em>;
}
export function Overridable(props) {
	const parts = { title: props.useFancy ? Fancy : 'h2' };
	return <parts.title>Title</parts.title>;
}
