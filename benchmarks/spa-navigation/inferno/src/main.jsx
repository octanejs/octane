import { createComponentVNode, render, rerender } from 'inferno';
import App, { navigate } from './App.jsx';

const target = document.getElementById('main');
let mounted = false;

window.__mount = (route) => {
	render(createComponentVNode(4, App, { route: route ?? 'a' }), target);
	mounted = true;
};
window.__navigate = (route) => {
	navigate(route);
	rerender();
};
window.__unmount = () => {
	if (mounted) {
		render(null, target);
		mounted = false;
	}
};
window.__reset = () => {
	window.__unmount();
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
