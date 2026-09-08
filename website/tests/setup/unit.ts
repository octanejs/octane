// TanStack Router's scroll restoration calls the browser scrolling primitives.
// jsdom omits scrollIntoView and reports scrollTo as "Not implemented". The
// website's real-browser suite covers actual positioning; unit route renders
// need inert host implementations.
if (typeof window !== 'undefined') {
	window.scrollTo = () => {};
	Element.prototype.scrollIntoView = () => {};
}
