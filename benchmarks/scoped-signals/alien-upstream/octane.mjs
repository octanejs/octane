// alien-signals' call style over Octane's public scope API, so its benchmarks
// run unchanged. Octane has no effect primitive: `effect` is a derived value
// with a subscriber that reads it again, which works for any effect body.
// `observe` subscribes to a computed value itself, which is what an
// application writes when the body only reads one value.
import { createScope } from 'octane/signals';

const scope = createScope({ scopeKey: 'alien-upstream' });
let next = 0;

export function signal(initial) {
	const value$ = scope.signal$('s' + next++, initial);
	return function (value) {
		return arguments.length ? value$.set(value) : value$.get();
	};
}

export function computed(read) {
	const value$ = scope.derived$('c' + next++, read);
	const get = () => value$.get();
	get.value$ = value$;
	return get;
}

export function effect(run) {
	const value$ = scope.derived$('e' + next++, run);
	value$.get();
	return value$.subscribe(() => value$.get());
}

export function observe(get) {
	const { value$ } = get;
	value$.get();
	return value$.subscribe(() => value$.get());
}
