import { createElement, render } from 'preact';
import { flushSync } from 'preact/compat';
import App, { bumpPartial, bumpRoot, hideMid, showMid } from './App.jsx';

const target = document.getElementById('main');
let mounted = false;

window.__mount = () => {
	flushSync(() => render(createElement(App, { depth: 10 }), target));
	mounted = true;
};
window.__updateRoot = () => flushSync(bumpRoot);
window.__updatePartial = () => flushSync(bumpPartial);
window.__partialUnmount = () => flushSync(hideMid);
window.__partialRemount = () => flushSync(showMid);
window.__unmount = () => {
	if (mounted) {
		flushSync(() => render(null, target));
		mounted = false;
	}
};
window.__reset = () => {
	if (mounted) {
		flushSync(() => render(null, target));
		mounted = false;
	}
	while (target.firstChild) target.removeChild(target.firstChild);
};
window.__ready = true;
