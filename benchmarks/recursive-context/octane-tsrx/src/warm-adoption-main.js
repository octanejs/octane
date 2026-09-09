import { createRoot, flushSync } from 'octane';
import WarmAdoptionControl from './WarmAdoptionControl.tsrx';
import WarmPlanControl from './WarmPlanControl.tsrx';

const container = document.getElementById('main');
const warmContainer = document.getElementById('warm');
let root;
let warmRoot;
let depth;
let version;
let mounted;
let starts;
let resolvers;

function waitForWarmResult() {
	if (warmContainer.querySelector('#warm-child')?.textContent === 'child:1')
		return Promise.resolve();
	return new Promise((resolve, reject) => {
		const observer = new MutationObserver(() => {
			if (warmContainer.querySelector('#warm-child')?.textContent !== 'child:1') return;
			observer.disconnect();
			clearTimeout(timeout);
			resolve();
		});
		const timeout = setTimeout(() => {
			observer.disconnect();
			reject(new Error('warm resource control did not settle'));
		}, 2000);
		observer.observe(warmContainer, { childList: true, subtree: true, characterData: true });
	});
}

function verifyWarmResult() {
	if (
		warmContainer.querySelector('#warm-parent')?.textContent !== 'parent:1' ||
		warmContainer.querySelector('#warm-child')?.textContent !== 'child:1'
	)
		throw new Error('warm result lost');
	if (starts.parent !== 1 || starts.child !== 1)
		throw new Error(`resources started ${starts.parent}/${starts.child} times`);
}

window.__primeWarm = async () => {
	starts = { parent: 0, child: 0 };
	warmRoot = createRoot(warmContainer);
	warmRoot.render(WarmPlanControl, {
		version: 1,
		load(name, version) {
			starts[name]++;
			return Promise.resolve(`${name}:${version}`);
		},
	});
	await waitForWarmResult();
	verifyWarmResult();
	warmRoot.unmount();
	if (warmContainer.childNodes.length !== 0) throw new Error('prime root did not unmount');
};
window.__mountDeep = (nextDepth) => {
	depth = nextDepth;
	version = 0;
	root = createRoot(container);
	root.render(WarmAdoptionControl, { depth, version });
	mounted = [...container.querySelectorAll('.memo-value')];
};
window.__updateDeep = () => {
	version++;
	flushSync(() => root.render(WarmAdoptionControl, { depth, version }));
};
window.__verifyDeep = () => {
	const values = [...container.querySelectorAll('.memo-value')];
	if (values.length !== depth + 1) throw new Error('deep memo values missing');
	for (let index = 0; index < values.length; index++) {
		const expectedDepth = depth - index;
		if (
			values[index] !== mounted[index] ||
			values[index].dataset.depth !== String(expectedDepth) ||
			values[index].textContent !== `${version}:${expectedDepth}`
		)
			throw new Error('memo value or identity changed');
	}
};
window.__unmountDeep = () => {
	root.unmount();
	if (container.childNodes.length !== 0) throw new Error('deep root did not unmount');
};
window.__mountPendingWarm = () => {
	starts = { parent: 0, child: 0 };
	resolvers = [];
	warmRoot = createRoot(warmContainer);
	warmRoot.render(WarmPlanControl, {
		version: 1,
		load(name, version) {
			starts[name]++;
			return new Promise((resolve) => resolvers.push(() => resolve(`${name}:${version}`)));
		},
	});
	if (starts.parent !== 1 || starts.child !== 1)
		throw new Error('independent resources did not start together');
	if (warmContainer.querySelector('#warm-pending')?.textContent !== 'waiting')
		throw new Error('pending UI missing');
};
window.__resolvePendingWarm = async () => {
	for (const resolve of resolvers) resolve();
	await waitForWarmResult();
};
window.__verifyPendingWarm = () => {
	verifyWarmResult();
	warmRoot.unmount();
	if (warmContainer.childNodes.length !== 0) throw new Error('warm root did not unmount');
};
window.__ready = true;
