import * as stylex from '@octanejs/stylex';

const styles = stylex.create({
	root: { padding: 16, color: 'tomato' },
	active: { color: 'blue' },
});

// `data-test` is a stable selector (StyleX only touches class/style); the atomic
// class comes from the spread. `props.on && styles.active` exercises conditional
// merge + last-wins precedence (active's `color` replaces root's).
export function Card(props) @{
	<div data-test="card" {...stylex.props(styles.root, props.on && styles.active)}>{'Card'}</div>
}

// An all-falsy `props()` returns `{}` — no className — so the element must have no
// class attribute at all (the optional-key case).
export function Empty(props) @{
	<div data-test="empty" {...stylex.props(props.on && styles.active)}>{'x'}</div>
}
