// React-style JSX fixtures: spreads and JSX comments through the .tsx compiler.

// A prop referenced ONLY inside a spread must be forwarded into the fragment.
export function SpreadProp(props) {
	return (
		<div {...props.attrs} data-testid="sp">
			{props.label}
		</div>
	);
}

// A module-level local referenced ONLY inside a spread must be captured.
const A = { 'data-z': 'z' };
export function SpreadLocal() {
	return <div {...A} data-testid="sl" />;
}

// A JSX comment mixed with a real child — comment renders nothing.
export function CommentMixed() {
	return (
		<div data-testid="cm">
			{/* hello */}
			<span class="y">hi</span>
		</div>
	);
}

// A JSX comment as the SOLE child — element renders empty.
export function CommentOnly() {
	return <div data-testid="co">{/* nothing here */}</div>;
}
