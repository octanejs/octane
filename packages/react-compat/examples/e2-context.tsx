// E2 — MEDIUM. Context + reducer + effect + ref + memo.
// Still fully bridgeable: createContext / useContext / useReducer /
// useEffect / useRef / useMemo are all `status: same` in REACT_API_MAP.
// Exercises the compiler's hook-slotting across several call sites in one
// component and a provider that renders `children`.
import { createContext, useContext, useReducer, useEffect, useRef, useMemo } from 'react';

const ThemeContext = createContext<'light' | 'dark'>('light');

export function ThemeProvider(props: { theme: 'light' | 'dark'; children: unknown }) {
	return <ThemeContext.Provider value={props.theme}>{props.children}</ThemeContext.Provider>;
}

type State = { n: number };
type Action = { type: 'inc' } | { type: 'add'; by: number };

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case 'inc':
			return { n: state.n + 1 };
		case 'add':
			return { n: state.n + action.by };
	}
}

export function Widget() {
	const theme = useContext(ThemeContext);
	const [state, dispatch] = useReducer(reducer, { n: 0 });
	const renders = useRef(0);
	useEffect(() => {
		renders.current += 1;
	});
	const label = useMemo(() => `${theme}:${state.n}`, [theme, state.n]);
	return (
		<div className="widget">
			<span className="label">{label}</span>
			<button onClick={() => dispatch({ type: 'inc' })}>bump</button>
		</div>
	);
}

// Composed app so a test can prove context propagates Provider → consumer.
export function App() {
	return (
		<ThemeProvider theme="dark">
			<Widget />
		</ThemeProvider>
	);
}
