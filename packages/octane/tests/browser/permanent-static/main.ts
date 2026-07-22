import { flushSync, hydrateRoot } from '../../../src/index.js';
import { PermanentStaticBrowser } from '../../_fixtures/permanent-static-browser.tsrx';

const container = document.querySelector('#root')!;
const layout = container.querySelector('#static-browser-layout')!;
const article = container.querySelector('#static-browser-article')!;
const svgGroup = container.querySelector('#static-browser-svg-group')!;
const mathRow = container.querySelector('#static-browser-math-row')!;
const liveAction = container.querySelector('#static-browser-live-action') as HTMLButtonElement;
const liveId = liveAction.dataset.runtimeId;

const external = document.createElement('strong');
external.id = 'external-before-hydration';
external.textContent = 'Externally managed before hydration';
container.querySelector('#externally-owned-range')!.replaceChildren(external);

let staticRenderCount = 0;
let clickedId: string | null = null;
const props = {
	label: 'Server live action',
	onStaticRender: () => staticRenderCount++,
	onLiveClick: (id: string) => (clickedId = id),
};
const root = hydrateRoot(container, PermanentStaticBrowser, props);
flushSync(() => {});
flushSync(() =>
	root.render(PermanentStaticBrowser, {
		...props,
		label: 'Updated live action',
	}),
);

function state() {
	const currentLayout = container.querySelector('#static-browser-layout')!;
	const currentArticle = container.querySelector('#static-browser-article');
	const currentSvgGroup = container.querySelector('#static-browser-svg-group');
	const currentMathRow = container.querySelector('#static-browser-math-row');
	const currentLiveAction = container.querySelector(
		'#static-browser-live-action',
	) as HTMLButtonElement;
	return {
		childIds: Array.from(currentLayout.children, (child) => child.id),
		externalPreserved:
			container.querySelector('#external-before-hydration') === external &&
			external.parentElement?.id === 'externally-owned-range',
		identity: {
			article: currentArticle === article,
			layout: currentLayout === layout,
			liveAction: currentLiveAction === liveAction,
			mathRow: currentMathRow === mathRow,
			svgGroup: currentSvgGroup === svgGroup,
		},
		live: {
			clickedId,
			id: currentLiveAction.dataset.runtimeId,
			label: currentLiveAction.textContent,
			serverId: liveId,
		},
		namespaces: {
			math: currentMathRow?.namespaceURI,
			svg: currentSvgGroup?.namespaceURI,
		},
		wrapperFree: {
			math: container.querySelector('#static-browser-math')?.firstElementChild === currentMathRow,
			svg: container.querySelector('#static-browser-svg')?.firstElementChild === currentSvgGroup,
		},
		staticRenderCount,
	};
}

window.__permanentStaticBrowser = { state };

declare global {
	interface Window {
		__permanentStaticBrowser: { state: typeof state };
	}
}
