// Upstream FakeMouseEvent assigns pageX/pageY after construction. Modern jsdom
// exposes those as prototype getters, so make them writable for the pristine suite.
for (const prop of ['pageX', 'pageY']) {
	Object.defineProperty(MouseEvent.prototype, prop, {
		configurable: true,
		enumerable: true,
		writable: true,
		value: 0,
	});
}
