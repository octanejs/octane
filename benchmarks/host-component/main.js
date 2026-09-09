import {
	createElement,
	createRoot,
	flushSync,
	hostComponent,
} from '../../packages/octane/src/index.ts';

const container = document.getElementById('main');
let root;
let count;
let mode;
let version;
let hosts;
let children;

// Runtime adapters such as motion.<tag> call hostComponent directly. The
// function mode supplies a fresh child body on every parent render, as compiled
// children do; the value mode supplies an equivalent descriptor.
function Rows(props, scope) {
	for (let index = 0; index < props.count; index++) {
		const label = `${index}:${props.version}`;
		const content =
			props.mode === 'function'
				? (_childProps, childScope) => {
						hostComponent(childScope, 0, 'span', { 'data-child': index }, label);
					}
				: createElement('span', { 'data-child': index }, label);
		hostComponent(
			scope,
			index,
			'section',
			{ 'data-host': index, 'data-version': props.version },
			content,
		);
	}
}

window.__mount = (options) => {
	count = options.count;
	mode = options.mode;
	version = 0;
	root = createRoot(container);
	root.render(Rows, { count, mode, version });
	flushSync(() => {});
	hosts = [...container.querySelectorAll('section')];
	children = [...container.querySelectorAll('span')];
};

window.__update = () => {
	version++;
	flushSync(() => root.render(Rows, { count, mode, version }));
};

window.__updateBatch = () => {
	for (let index = 0; index < 12; index++) window.__update();
};

window.__verify = () => {
	const actualHosts = [...container.querySelectorAll('section')];
	const actualChildren = [...container.querySelectorAll('span')];
	if (actualHosts.length !== count || actualChildren.length !== count) {
		throw new Error(`missing host/child nodes: ${actualHosts.length}/${actualChildren.length}`);
	}
	for (let index = 0; index < count; index++) {
		if (actualHosts[index] !== hosts[index] || actualChildren[index] !== children[index]) {
			throw new Error(`host or child identity changed at ${index}`);
		}
		if (
			actualHosts[index].getAttribute('data-host') !== String(index) ||
			actualHosts[index].getAttribute('data-version') !== String(version) ||
			actualChildren[index].getAttribute('data-child') !== String(index) ||
			actualChildren[index].textContent !== `${index}:${version}` ||
			actualChildren[index].parentNode !== actualHosts[index]
		) {
			throw new Error(`host props or child output stale at ${index}, version ${version}`);
		}
	}
};

window.__unmount = () => {
	root.unmount();
	if (container.childNodes.length !== 0) throw new Error('unmount left host content behind');
};

window.__ready = true;
