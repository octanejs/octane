import { createRoot } from 'octane';
import WarmPlanControl from './WarmPlanControl.tsrx';

const container = document.getElementById('main');
const started = { parent: 0, child: 0 };
let root = null;

function load(name, version) {
	started[name]++;
	return Promise.resolve(`${name}:${version}`);
}

window.__mountWarmPlanControl = async () => {
	root = createRoot(container);
	root.render(WarmPlanControl, { load, version: 1 });
	if (container.querySelector('#warm-child')?.textContent === 'child:1') return;
	await new Promise((resolve, reject) => {
		const observer = new MutationObserver(() => {
			if (container.querySelector('#warm-child')?.textContent !== 'child:1') return;
			observer.disconnect();
			clearTimeout(timeout);
			resolve();
		});
		const timeout = setTimeout(() => {
			observer.disconnect();
			reject(new Error('warm-plan control did not settle'));
		}, 1000);
		observer.observe(container, { childList: true, subtree: true, characterData: true });
	});
};

window.__verifyWarmPlanControl = () => {
	if (container.querySelector('#warm-parent')?.textContent !== 'parent:1') {
		throw new Error('warm-plan control lost the parent resource');
	}
	if (container.querySelector('#warm-child')?.textContent !== 'child:1') {
		throw new Error('warm-plan control lost the child resource');
	}
	if (started.parent !== 1 || started.child !== 1) {
		throw new Error(`warm-plan control started ${started.parent}/${started.child} resources`);
	}
	root.unmount();
};

window.__ready = true;
