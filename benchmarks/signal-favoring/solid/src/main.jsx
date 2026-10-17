import { render } from '@solidjs/web';
import { flush } from 'solid-js';
import App, {
	bumpAt1,
	bumpAt11,
	bumpAt21,
	bumpAt31,
	bumpAt41,
	bumpAt51,
	bumpAt61,
	bumpAt71,
	bumpAt81,
	bumpAt91,
} from './App.jsx';

const target = document.getElementById('main');
let dispose = null;

window.__mount = () => {
	dispose = render(() => <App />, target);
};
window.__unmount = () => {
	if (dispose) {
		dispose();
		dispose = null;
	}
};
window.__reset = () => {
	if (dispose) {
		dispose();
		dispose = null;
	}
	while (target.firstChild) target.removeChild(target.firstChild);
};
// Solid 2.0 batches updates and flushes asynchronously; flush() forces the DOM
// mutation to complete synchronously so the harness can time it inside the call
// (matching the other adapters' flushSync). Without it the setter returns before
// the update lands and the op would read as an unfairly tiny ~0ms.
window.__bumpAt1 = () => flush(bumpAt1);
window.__bumpAt11 = () => flush(bumpAt11);
window.__bumpAt21 = () => flush(bumpAt21);
window.__bumpAt31 = () => flush(bumpAt31);
window.__bumpAt41 = () => flush(bumpAt41);
window.__bumpAt51 = () => flush(bumpAt51);
window.__bumpAt61 = () => flush(bumpAt61);
window.__bumpAt71 = () => flush(bumpAt71);
window.__bumpAt81 = () => flush(bumpAt81);
window.__bumpAt91 = () => flush(bumpAt91);
// Batched sweep: enqueue all 10 stateful bumps, then ONE flush() — Solid's natural
// microtask coalescing, bounded synchronously. Contrast bump_sweep (flush per bump).
window.__sweepBatched = () => flush(() => {
	bumpAt1();
	bumpAt11();
	bumpAt21();
	bumpAt31();
	bumpAt41();
	bumpAt51();
	bumpAt61();
	bumpAt71();
	bumpAt81();
	bumpAt91();
});
// Same batch queued DESCENDANT-first (deepest stateful node first).
window.__sweepBatchedReverse = () => flush(() => {
	bumpAt91();
	bumpAt81();
	bumpAt71();
	bumpAt61();
	bumpAt51();
	bumpAt41();
	bumpAt31();
	bumpAt21();
	bumpAt11();
	bumpAt1();
});
window.__ready = true;
