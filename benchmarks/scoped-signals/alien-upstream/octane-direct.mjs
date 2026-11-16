// As octane.mjs, for the octane-direct lane: alien-signals' call style over
// Octane's public scope API, so its benchmarks
// run unchanged: keyless `scope.signal$(null, …)` and `scope.derived$(null, …)`,
// and `scope.effect`, each handed out as a bound function, as alien-signals does.
// `observe` subscribes to a computed value itself instead, which is what an
// application writes when it only needs to hear of a change.
import { createScope } from 'octane/signals';

const scope = createScope({ scopeKey: 'alien-upstream' });
function access(...value) {
	return value.length ? this.set(value[0]) : this.get();
}

/** Passed to a computed's function, it returns the handle; `observe` needs that. */
const HANDLE = Symbol('handle');

function read(token) {
	return token === HANDLE ? this : this.get();
}

export function signal(initial) {
	return access.bind(scope.signal$(null, initial));
}

export function computed(compute) {
	return read.bind(scope.derived$(null, compute));
}

export function effect(run) {
	return scope.effect(run);
}

export function observe(get) {
	const value$ = get(HANDLE);
	value$.get();
	return value$.subscribe(() => value$.get());
}
