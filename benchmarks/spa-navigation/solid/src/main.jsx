import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import App, { navigate } from './App.jsx';

const target = document.getElementById('main');
let dispose = null;

window.__mount = (route) => {
	dispose = render(() => <App route={route ?? 'a'} />, target);
};
// Solid 2.0 batches and flushes asynchronously; flush() completes the DOM
// mutation inside the timed call, matching the other adapters' flushSync.
window.__navigate = (route) => {
	navigate(route);
	flush();
};
window.__unmount = () => {
	if (dispose) {
		dispose();
		dispose = null;
	}
};
window.__reset = () => {
	window.__unmount();
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
