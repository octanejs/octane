// TanStack Router's scroll restoration calls the browser's window.scrollTo().
// jsdom exposes that method but only reports "Not implemented" through its
// virtual console. Scroll restoration itself is covered by the router package
// and the website's real-browser suite; website unit tests need only a quiet
// host implementation while rendering routes.
if (typeof window !== 'undefined') {
	window.scrollTo = () => {};
}
