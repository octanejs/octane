import { createRoot, flushSync } from 'octane';
import App from './App.tsrx';
import {
	clearOwned,
	clearSharedLarge,
	clearSharedSmall,
	fillOwned,
	fillSharedLarge,
	fillSharedSmall,
} from './ops.js';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main root');

// The rows carry no effects, so flushSync alone closes the timed window: the
// DOM mutation is the entire commit.
const run = (fn) => flushSync(fn);

// index.html does NOT auto-mount; the harness calls __mount() once (untimed).
window.__mount = () => {
	createRoot(target).render(App);
};

// Untimed state-reset helpers (harness `pre` steps).
window.__fillSharedSmall = () => run(fillSharedSmall);
window.__fillSharedLarge = () => run(fillSharedLarge);
window.__fillOwned = () => run(fillOwned);

// Timed ops.
window.__opClearSharedSmall = () => run(clearSharedSmall);
window.__opClearSharedLarge = () => run(clearSharedLarge);
window.__opClearOwned = () => run(clearOwned);

window.__ready = true;
