import { useState, useId } from 'octane';

// A single useId rendered into BOTH a data-testid attribute and the text body,
// so a test can read the id from either the attribute or the DOM text — and so
// the SAME fixture can be server-rendered (id lands in the HTML string) and
// client-mounted (id lands in the live DOM). Re-render is driven by a state
// counter whose value also shows in a sibling so we can confirm a render
// actually happened while the id stays put.
export function Single(props) @{
	const id = useId();
	// Report the id the component actually COMPUTED this render — lets a hydration
	// test capture the CLIENT's id directly (rather than re-reading the adopted
	// server attribute) to prove server == client.
	props?.onId?.(id);
	const [n, setN] = useState(0);
	<div>
		<output id="single" data-testid={id}>
			{id as string}
		</output>
		<button id="bump" onClick={() => setN(n + 1)}>
			{'n=' + n as string}
		</button>
	</div>
}

// Three useId() calls in one component. Per ReactDOMUseId-test.js:331 each call
// must yield a DISTINCT id, and they must be stable across re-renders. We emit
// all three so a test can assert distinctness + stability.
export function Triple(props) @{
	const a = useId();
	const b = useId();
	const c = useId();
	const [n, setN] = useState(0);
	<div>
		<span id="a" data-testid={a}>
			{a as string}
		</span>
		<span id="b" data-testid={b}>
			{b as string}
		</span>
		<span id="c" data-testid={c}>
			{c as string}
		</span>
		<button id="bump3" onClick={() => setN(n + 1)}>
			{'n=' + n as string}
		</button>
	</div>
}

// Wrapper-component indirection: a parent component that uses useId AND renders
// a child component that also uses useId. Per ReactDOMUseId-test.js:168 the ids
// must stay stable through component indirection and the parent/child ids must
// differ.
function Inner(props) @{
	const id = useId();
	<span id="inner" data-testid={id}>
		{id as string}
	</span>
}

export function Wrapper(props) @{
	const id = useId();
	const [n, setN] = useState(0);
	<div id="outer" data-testid={id}>
		<Inner />
		<button id="bumpw" onClick={() => setN(n + 1)}>
			{'n=' + n as string}
		</button>
	</div>
}
