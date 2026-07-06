// The `react-dom` / `react-dom/client` compat entry. React scatters these
// across `react-dom` and `react-dom/client`; Octane homes them all on `octane`.
// The codemod re-homes the import here; this module re-exports from Octane.
//
// Unsupported (no runtime shim): legacy `render`/`unmountComponentAtNode`
// (use createRoot), `renderToString`/streaming (use render() from octane/server).
export { createPortal, flushSync, createRoot, hydrateRoot } from 'octane';

const notSupported = (name: string, use: string) =>
	new Error(`[react-compat] ${name} is not supported on Octane — ${use}.`);

export function render(): never {
	throw notSupported('ReactDOM.render (legacy)', 'use createRoot(container).render(...)');
}
export function unmountComponentAtNode(): never {
	throw notSupported('unmountComponentAtNode', 'use root.unmount()');
}
