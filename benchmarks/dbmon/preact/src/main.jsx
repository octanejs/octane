import { createElement, render } from 'preact';
import { flushSync } from 'preact/compat';
import App from './App.jsx';
import { remount, sortRows, tickFull, tickPartial } from './ops.js';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');
let mounted = false;

window.__mount = () => {
	flushSync(() => render(createElement(App), target));
	mounted = true;
};
window.__tick = () => flushSync(tickFull);
window.__tickPartial = () => flushSync(tickPartial);
window.__remount = () => flushSync(remount);
window.__sort = () => flushSync(sortRows);
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
