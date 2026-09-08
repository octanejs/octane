import { createRoot, flushSync, hydrateRoot, type Root } from '../../../src/index.js';
import { theme } from './theme.tsrx';
import { Panel } from './panel.tsrx';

function snapshot(container: HTMLElement) {
	const outer = container.querySelector('.outer') as HTMLElement;
	const inner = container.querySelector('.inner') as HTMLElement;
	const dark = container.querySelector('.outer > span') as HTMLElement;
	return {
		outerColor: getComputedStyle(outer).color,
		innerColor: getComputedStyle(inner).color,
		innerWeight: getComputedStyle(inner).fontWeight,
		darkColor: getComputedStyle(dark).color,
		darkClasses: Array.from(dark.classList),
		outerClasses: Array.from(outer.classList),
		innerClasses: Array.from(inner.classList),
	};
}

const roots: Root[] = [];
const ssrContainer = document.querySelector('#ssr-root') as HTMLElement;
const serverOuter = ssrContainer.querySelector('.outer');
let hydrated: ReturnType<typeof snapshot> | null = null;
let hydratedSame = false;
if (serverOuter !== null) {
	const root = hydrateRoot(ssrContainer, Panel);
	flushSync(() => {});
	roots.push(root);
	hydrated = snapshot(ssrContainer);
	hydratedSame = ssrContainer.querySelector('.outer') === serverOuter;
}

const clientContainer = document.querySelector('#client-root') as HTMLElement;
const clientRoot = createRoot(clientContainer);
clientRoot.render(Panel);
flushSync(() => {});
roots.push(clientRoot);
const client = snapshot(clientContainer);

const sheetIds = Array.from(document.querySelectorAll('style[data-octane]')).map((sheet) =>
	sheet.getAttribute('data-octane'),
);

window.__scopedStyles = {
	client,
	hydrated,
	hydratedSame,
	sheetIds,
	themeClass: theme.$class,
	unmount() {
		for (const root of roots) root.unmount();
	},
};

declare global {
	interface Window {
		__scopedStyles: {
			client: ReturnType<typeof snapshot>;
			hydrated: ReturnType<typeof snapshot> | null;
			hydratedSame: boolean;
			sheetIds: Array<string | null>;
			themeClass: string;
			unmount(): void;
		};
	}
}
