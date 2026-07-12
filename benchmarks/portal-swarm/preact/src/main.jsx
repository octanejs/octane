import { createElement, render } from 'preact';
import { flushSync } from 'preact/compat';
import App from './App.jsx';
import * as ops from './ops.js';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');
let mounted = false;

window.__hits = 0;
window.__mount = () => {
	flushSync(() => render(createElement(App), target));
	mounted = true;
};
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
window.__openA = () => flushSync(ops.openA);
window.__closeA = () => flushSync(ops.closeA);
window.__openB = () => flushSync(ops.openB);
window.__closeB = () => flushSync(ops.closeB);
window.__openBS = () => flushSync(ops.openBS);
window.__closeBS = () => flushSync(ops.closeBS);
window.__openAll = () => flushSync(ops.openAll);
window.__closeAll = () => flushSync(ops.closeAll);
window.__rerenderA = () => flushSync(ops.rerenderA);
window.__rerenderB = () => flushSync(ops.rerenderB);
window.__rerenderBS = () => flushSync(ops.rerenderBS);
window.__setDistinct = (on) => flushSync(() => ops.setDistinct(on));
window.__ready = true;
