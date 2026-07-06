// E4 — THE WALL. Three genuinely-divergent patterns in one file. The
// bridger AUTOFIXES one, FLAGS two, and never silently "passes" any of them.
//
//  1. forwardRef        → autofixable: rewrite to React-19 refs-as-props.
//  2. controlled input  → FLAG: Octane inputs are native/uncontrolled; there
//                          is no synthetic per-keystroke `onChange` and no
//                          value-reassertion. Behavioral, not syntactic — no
//                          safe deterministic rewrite. Route to the MCP.
//  3. class component    → BLOCK: no class components. Class→hooks is a
//                          semantic rewrite (lifecycle→effects); hand/MCP port.
import { forwardRef, useState, Component } from 'react';
import type { ReactNode } from 'react';

// (1) autofixable
export const FancyInput = forwardRef<HTMLInputElement, { className?: string }>(
	function FancyInput(props, ref) {
		return <input ref={ref} className={props.className} placeholder="type…" />;
	},
);

// (2) flag — controlled input with synthetic onChange
export function ControlledField() {
	const [value, setValue] = useState('');
	return <input value={value} onChange={(e) => setValue((e.target as HTMLInputElement).value)} />;
}

// (3) block — class component / error boundary
export class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	componentDidCatch(error: Error) {
		console.error('boundary caught', error);
	}
	render() {
		return this.state.error ? <p className="err">error</p> : this.props.children;
	}
}
