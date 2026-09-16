import * as stylex from '@octanejs/stylex';

const styles = stylex.create({
	base: { color: 'black', padding: 8, opacity: 1 },
	active: { color: 'red', opacity: 0.75 },
});

export function classes(active) {
	// Keep the competing variants in one real StyleX merge. No copied hashes or
	// per-token toggles approximate StyleX's property precedence.
	return stylex.attrs(styles.base, active && styles.active).class;
}
