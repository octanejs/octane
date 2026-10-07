import { flushSync, hydrateRoot } from 'octane';
import { attachBehaviorRoot } from 'octane/behavior';
import { Frame, type FrameProps } from './hydrate-frame-app.tsrx';
import { frameProps } from './hydrate-frame-props.ts';

// A server-rendered application frame hydrated by the renderer, with a
// renderer-free behavior island beside it: native signal reads, a keyed list,
// a resolved @try boundary, forwarded style objects and a portal opened after
// hydration. The harness renders `html` with the server build of the same
// module and hands it to this production client bundle.
export async function run(container: HTMLElement, html: string) {
	const document = container.ownerDocument;
	container.innerHTML = html;
	const island = document.createElement('aside');
	island.innerHTML = '<button id="island-like">like</button><output id="island-count">0</output>';
	document.body.append(island);

	const serverMain = container.querySelector('main');
	const serverRows = [...container.querySelectorAll('li')];
	const props: FrameProps = frameProps();
	const root = hydrateRoot(container, Frame, props);
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
	const adopted =
		container.querySelector('main') === serverMain &&
		[...container.querySelectorAll('li')].every((row, index) => row === serverRows[index]);
	const content = container.querySelector('#frame-content')?.textContent;
	const width = (container.querySelector('#frame-sidebar') as HTMLElement).style.width;

	const behavior = attachBehaviorRoot(island);
	let likes = 0;
	let islandAdopted = false;
	behavior.registerBehavior({
		target: '#island-like',
		events: ['click'],
		adopt(element) {
			islandAdopted = element === island.firstElementChild;
		},
		handleEvent() {
			island.querySelector('output')!.textContent = String(++likes);
		},
	});
	await behavior.ready;

	flushSync(() => (container.querySelector('#frame-select') as HTMLButtonElement).click());
	const selected = container.querySelector('#frame-select')!.textContent;
	const length = container.querySelector('#frame-length')!.textContent;
	const highlighted = (container.querySelector('li[data-id="sent"]') as HTMLElement).style.color;
	flushSync(() => (container.querySelector('#frame-menu-toggle') as HTMLButtonElement).click());
	const portal = document.querySelector('#frame-menu')?.textContent;
	(island.querySelector('#island-like') as HTMLButtonElement).click();
	const islandCount = island.querySelector('output')!.textContent;

	root.unmount();
	behavior.dispose();
	island.remove();
	return {
		adopted,
		content,
		width,
		selected,
		length,
		highlighted,
		portal,
		islandAdopted,
		islandCount,
		portalCleaned: document.querySelector('#frame-menu') === null,
		cleaned: container.childNodes.length === 0,
	};
}
