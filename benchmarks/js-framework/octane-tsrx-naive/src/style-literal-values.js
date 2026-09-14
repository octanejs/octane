export const displayValue = 'block';

export let colorEvaluations = 0;

export function recordColor(value) {
	colorEvaluations++;
	return value;
}

// Imported objects exercise runtime spread snapshots, including a suffix-key collision.
export const styleBase = { fontStyle: 'normal' };
export const styleExtra = { fontVariant: 'normal' };
export const styleCollision = { color: 'green', fontStyle: 'normal' };
