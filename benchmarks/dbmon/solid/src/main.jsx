import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import App from './App.jsx';
import { tickFull, tickPartial, remount, sortRows } from './ops.js';

// Measurement-local: ?node=1 flips the driver to the node-delivery prototype.
globalThis.__PATCH_NODE__ = new URLSearchParams(location.search).has("node");

const target = document.getElementById('main');
let dispose = null;

// index.html does NOT auto-mount — harness wraps each call in performance.now().
// Solid 2.0 batches + flushes async, so `flush()` forces the DOM mutation to
// complete synchronously inside the timed call (matching the other adapters).
window.__mount = () => {
	dispose = render(() => <App />, target);
};
window.__tick = () => {
	tickFull();
	flush();
};
window.__tickPartial = () => {
	tickPartial();
	flush();
};
window.__remount = () => {
	remount();
	flush();
};
window.__sort = () => {
	sortRows();
	flush();
};
window.__unmount = () => {
	if (dispose) {
		dispose();
		dispose = null;
	}
};
window.__reset = () => {
	if (dispose) {
		dispose();
		dispose = null;
	}
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
