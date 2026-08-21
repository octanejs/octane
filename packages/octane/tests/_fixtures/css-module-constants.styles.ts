// A small generated-CSS-provider stand-in. Real Vite CSS emission is covered by
// the production adapter tests; these exports make the compiler proof's value
// and immutability contract executable in both runtimes.
export const badge = '_sheet_badge';
export const tail = '_sheet_tail';

const styles = Object.freeze({
	root: '_sheet_root composed',
	escaped: '_sheet_&"<',
	empty: '',
	tail,
});

export const mutableStyles = { current: '_mutable_first' };

export function setMutableClass(value: string) {
	mutableStyles.current = value;
}

export default styles;
