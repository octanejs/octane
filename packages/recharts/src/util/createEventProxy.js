// Vendored verbatim from recharts@3.9.2 es6/util/createEventProxy.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
export function createEventProxy(reactEvent) {
	reactEvent.persist();
	var currentTarget = reactEvent.currentTarget;
	return new Proxy(reactEvent, {
		get: (target, prop) => {
			if (prop === 'currentTarget') {
				return currentTarget;
			}
			var value = Reflect.get(target, prop);
			if (typeof value === 'function') {
				return value.bind(target);
			}
			return value;
		},
	});
}
