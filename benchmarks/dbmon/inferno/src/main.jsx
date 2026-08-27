import { createComponentVNode, render } from 'inferno';
import App from './App.jsx';
import { tickFull, tickPartial, remount, sortRows } from './ops.js';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');
let mounted = false;

// index.html does NOT auto-mount — harness wraps each call in performance.now().
window.__mount = () => {
	render(createComponentVNode(4, App), target);
	mounted = true;
};
window.__tick = tickFull;
window.__tickPartial = tickPartial;
window.__remount = remount;
window.__sort = sortRows;
window.__unmount = () => {
	if (mounted) {
		render(null, target);
		mounted = false;
	}
};
window.__reset = () => {
	if (mounted) {
		render(null, target);
		mounted = false;
	}
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
