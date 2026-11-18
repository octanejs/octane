import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import App from './App.jsx';
import { caseByName } from '../../shared/workloads.js';
import { clearSetter, commit } from '../../shared/bridge.js';
import '../../octane-tsrx/src/style.css';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

let dispose = null;
let preparedCase = null;

window.__mount = () => {
	dispose = render(() => <App />, target);
	flush();
};

window.__reset = () => {
	if (dispose !== null) dispose();
	dispose = null;
	preparedCase = null;
	clearSetter();
	while (target.firstChild) target.removeChild(target.firstChild);
};

// Solid's reconcile adopts its input as the store's backing, so the shared
// workload snapshots must not be committed directly (a later case would find
// its endpoint mutated). The private copies are made OUTSIDE the timer, and
// the two endpoints are cloned in ONE structuredClone call: UIbench builds
// `after` from `before` immutably, so every unchanged row/cell/subtree is the
// SAME object in both — the sharing the other fixtures receive as-is and that
// reconcile's `next === previous` short-circuit depends on. Two separate
// clones would hand Solid a fully fresh object graph per commit (a deep diff
// of every leaf for a one-node move) that no other target is asked to do.
function privateEndpoints(entry) {
	return structuredClone({ before: entry.before, after: entry.after });
}
window.__prepare = (name) => {
	const { before, after } = privateEndpoints(caseByName(name));
	preparedCase = { name, after };
	commit(before);
	flush();
};
window.__run = (name) => {
	const after =
		preparedCase?.name === name ? preparedCase.after : privateEndpoints(caseByName(name)).after;
	preparedCase = null;
	commit(after);
	flush();
};
window.__ready = true;
