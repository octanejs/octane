// The Toaster reads prefers-reduced-motion on every render; jsdom has no matchMedia.
window.matchMedia = ((query: string) => ({
	matches: false,
	media: query,
	onchange: null,
	addListener() {},
	removeListener() {},
	addEventListener() {},
	removeEventListener() {},
	dispatchEvent: () => false,
})) as typeof window.matchMedia;
