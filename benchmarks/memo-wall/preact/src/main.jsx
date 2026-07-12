// Probes must exist before any component renders.
import './probes.js';
import { createElement, render } from 'preact';
import { flushSync } from 'preact/compat';
import App from './App.jsx';
import {
	ctxA,
	ctxB,
	currentState,
	oneChangeA,
	oneChangeB,
	parentRerenderA,
	parentRerenderB,
} from './ops.js';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');
let mounted = false;

window.__mount = () => {
	flushSync(() => render(createElement(App), target));
	mounted = true;
};
window.__tickA = () => flushSync(parentRerenderA);
window.__tickB = () => flushSync(parentRerenderB);
window.__oneChangeA = () => flushSync(oneChangeA);
window.__oneChangeB = () => flushSync(oneChangeB);
window.__ctxA = () => flushSync(ctxA);
window.__ctxB = () => flushSync(ctxB);
window.__state = currentState;
window.__unmount = () => {
	if (mounted) {
		render(null, target);
		mounted = false;
	}
};
window.__ready = true;
