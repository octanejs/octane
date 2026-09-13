/** @jsxImportSource octane */
import { createRoot, delegateEvents, hydrateRoot } from 'octane';
import { WindowBrowserFixture } from './fixture';

delegateEvents(['click']);
const container = document.querySelector<HTMLElement>('#root');
if (!container) throw new Error('Missing root');
const kind = container.dataset.kind;
if (kind !== 'list' && kind !== 'grid') throw new Error('Invalid virtualizer kind');
const existing = [...container.querySelectorAll('[data-item]')];
const hydrating = container.childNodes.length > 0;
const root = hydrating
	? hydrateRoot(container, WindowBrowserFixture, { kind })
	: createRoot(container);
if (!hydrating) root.render(WindowBrowserFixture, { kind });
container.dataset.adopted = String(
	existing.length > 0 &&
		existing.every((item, index) => item === container.querySelectorAll('[data-item]')[index]),
);
requestAnimationFrame(() => {
	container.dataset.firstFrameItems = String(container.querySelectorAll('[data-item]').length);
	container.dataset.firstFrameBottom = String(
		document.querySelector('#after')!.getBoundingClientRect().top,
	);
	requestAnimationFrame(() => {
		container.dataset.ready = 'true';
	});
});
