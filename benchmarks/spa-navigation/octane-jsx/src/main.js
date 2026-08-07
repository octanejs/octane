import { createRoot, flushSync } from 'octane';
import App, { navigate } from './App.tsx';

const target = document.getElementById('main');
let root = null;

// index.html does NOT auto-mount; the harness times each call itself.
window.__mount = (route) => {
	root = createRoot(target);
	root.render(App, { route: route ?? 'a' });
};
window.__navigate = (route) => {
	flushSync(() => navigate(route));
};
window.__unmount = () => {
	if (root) {
		root.unmount();
		root = null;
	}
};
window.__reset = () => {
	window.__unmount();
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
