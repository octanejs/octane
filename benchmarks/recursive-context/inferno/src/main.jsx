import { createComponentVNode, render } from 'inferno';
import App, { bumpRoot, bumpPartial, hideMid, showMid } from './App.jsx';

const target = document.getElementById('main');
let mounted = false;

// index.html does NOT auto-mount — harness wraps each call in performance.now().
window.__mount = () => {
	render(createComponentVNode(4, App, { depth: 10 }), target);
	mounted = true;
};
window.__updateRoot = bumpRoot;
window.__updatePartial = bumpPartial;
window.__partialUnmount = hideMid;
window.__partialRemount = showMid;
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
