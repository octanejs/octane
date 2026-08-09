import { createVaporApp, nextTick } from 'vue';
import App from './App.vue';
import { navigate } from './state.js';

const target = document.getElementById('main');
let app = null;

window.__mount = (route) => {
	app = createVaporApp(App, { route: route ?? 'a' });
	app.mount(target);
};
// Vue batches updates and flushes on a microtask with no public synchronous
// flush, so the op returns nextTick(), which settles after the DOM mutation has
// landed. The harness extends the timed window until it settles; the microtask
// hop is Vue's own scheduling cost, so it belongs inside the measurement.
window.__navigate = (route) => {
	navigate(route);
	return nextTick();
};
window.__unmount = () => {
	if (app) {
		app.unmount();
		app = null;
	}
};
window.__reset = () => {
	window.__unmount();
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
