/** @jsxImportSource octane */
import { useLayoutEffect, useState, type OctaneNode } from 'octane';

// A React-style `.tsx` only-child bare `{expr}` value hole (NOT `{… as string}`).
// It lowers MARKERLESS — a single Text node appended to the host, no `<!>`
// placeholder and no `<!--[-->…<!--]-->` block on the server — so the client
// adopts the server's bare text on hydration, exactly like a `.tsrx` text hole.

let _bump: (() => void) | null = null;
export function bump() {
	if (_bump) _bump();
}

export function Counter() {
	const [n, setN] = useState(0);
	_bump = () => setN((x) => x + 1);
	return <span id="c">{n}</span>;
}

export function SpreadButton({
	children,
	...props
}: {
	children?: OctaneNode;
	title?: string;
	onClick?: (event: MouseEvent) => void;
	dangerouslySetInnerHTML?: { __html: string };
	suppressHydrationWarning?: boolean;
}) {
	return <button {...props}>{children}</button>;
}

export function StatefulLabel({ onCleanup }: { onCleanup: () => void }) {
	const [count, setCount] = useState(0);
	useLayoutEffect(() => onCleanup, [onCleanup]);
	return <span onClick={() => setCount((n) => n + 1)}>{'Child ' + count}</span>;
}

export function SpreadButtonPair({ first, second }: { first: OctaneNode; second: OctaneNode }) {
	return (
		<div>
			<SpreadButton title="first">{first}</SpreadButton>
			<SpreadButton title="second">{second}</SpreadButton>
		</div>
	);
}

export function ConditionalChild(props: { on: boolean; label: string }) {
	return <div>{props.on ? <b>yes</b> : props.label}</div>;
}
