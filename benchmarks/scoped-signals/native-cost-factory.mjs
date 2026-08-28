// This module is outside the component AST so counting factory calls cannot
// alter the compiler's dependency or purity analysis.
let calls = 0;

export function make$(a, b, c, d, e) {
	calls++;
	const value = [a, b, c, d, e].join(':');
	return {
		status: 'fulfilled',
		value,
		then(resolve) {
			resolve(value);
		},
	};
}

export function resetFactoryCalls() {
	calls = 0;
}

export function factoryCalls() {
	return calls;
}
