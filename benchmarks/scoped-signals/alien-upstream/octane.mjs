// alien-signals' call style over Octane's public scope API, so its benchmarks
// run unchanged: keyless `scope.signal$(null, …)` and `scope.derived$(null, …)`,
// and `scope.effect`, each handed out as a bound function, as alien-signals does.
// The octane-direct lane (octane-direct.mjs) subscribes to computed values instead.
import { createScope } from 'octane/signals';

const scope = createScope({ scopeKey: 'alien-upstream' });
function access(...value) {
	return value.length ? this.set(value[0]) : this.get();
}

export function signal(initial) {
	return access.bind(scope.signal$(null, initial));
}

export function computed(compute) {
	const value$ = scope.derived$(null, compute);
	return value$.get.bind(value$);
}

export function effect(run) {
	return scope.effect(run);
}
