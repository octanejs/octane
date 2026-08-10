import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createElement } from 'react';
import App, { navigate } from './App.jsx';

const target = document.getElementById('main');
let root = null;

window.__mount = (route) => {
	root = createRoot(target);
	flushSync(() => root.render(createElement(App, { route: route ?? 'a' })));
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
