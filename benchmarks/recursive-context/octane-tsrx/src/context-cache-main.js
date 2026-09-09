import { createRoot, flushSync } from 'octane';
import ContextCache, { ROW_IDS } from './ContextCache.tsrx';

const target = document.getElementById('main');
let root = null;
let ids = ROW_IDS;
let mode = 'zero';
let version = 0;
let secondary = 0;

function render() {
	root.render(ContextCache, { ids, mode, version, secondary });
}

window.__mountCache = (variant) => {
	if (root !== null) throw new Error('Cache fixture already mounted');
	if (!['zero', 'one', 'two'].includes(variant)) throw new Error('Unknown cache fixture variant');
	mode = variant;
	ids = ROW_IDS;
	version = 0;
	secondary = 0;
	root = createRoot(target);
	render();
};
window.__updateCache = () => {
	version++;
	flushSync(render);
};
window.__updateSecondaryCache = () => {
	secondary++;
	flushSync(render);
};
window.__reorderCache = () => {
	ids = [...ids].reverse();
	flushSync(render);
};
window.__unmountCache = () => {
	root?.unmount();
	root = null;
};
window.__readyCache = true;
