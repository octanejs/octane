// Fixture for multi-line JSX string attributes (see
// multiline-string-attrs.test.ts). The spread forces the hostValue binding
// path; the component prop exercises the createElement/prop-bag paths.
function Chip(props: { title?: string }) {
	return <span>
		{props.title as string}
	</span>;
}

export function SpreadHost(props: { rest?: Record<string, string> }) {
	return <div {...props.rest} class="one
		two" />;
}

export function PropChip() {
	return <Chip title="one
		two" />;
}
