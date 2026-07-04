function Leaf(props) @{
	<div class="leaf">
		{props.label as string}
	</div>
}

// A component whose body is a MIXED multi-root fragment: a COMPONENT root (<Leaf/>)
// BEFORE a static host root (<input/>). This is the exact fragment-body codegen path
// that dropped the component root's source-order `<!>` anchor — the client appended the
// component AFTER the static content, reversing order and (critically) diverging from
// the server, which emits them in source order. Hydration must adopt cleanly.
export function MixedFrag() @{
	<>
		<Leaf label="A" />
		<input type="text" />
	</>
}
