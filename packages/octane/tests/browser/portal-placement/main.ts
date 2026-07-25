import { createRoot, flushSync } from '../../../src/index.js';
import {
	PortalPlacementApp,
	type PortalPlacementControls,
	type PortalPlacementMode,
} from '../../_fixtures/portal.tsrx';

const container = document.querySelector('#root') as HTMLElement;
const portalTarget = document.querySelector('#portal-target') as HTMLElement;
const foreignBefore = portalTarget.querySelector('[data-slot="foreign-before"]')!;
let controls!: PortalPlacementControls;

const root = createRoot(container);
root.render(PortalPlacementApp, {
	target: portalTarget,
	initialMode: 'portal',
	bind(next) {
		controls = next;
	},
});
flushSync(() => {});

const foreignAfter = document.createElement('i');
foreignAfter.dataset.slot = 'foreign-after';
foreignAfter.textContent = 'after';
portalTarget.appendChild(foreignAfter);

const initialParent = container.querySelector('[data-slot="parent"]')!;
const initialSecond = container.querySelector('[data-slot="second"]')!;
const initialThird = container.querySelector('[data-slot="third"]')!;

function slots(parent: Element): Array<string | null> {
	return Array.from(parent.children, (child) => child.getAttribute('data-slot'));
}

function snapshot() {
	const parent = container.querySelector('[data-slot="parent"]')!;
	return {
		identity: {
			foreignAfter: portalTarget.querySelector('[data-slot="foreign-after"]') === foreignAfter,
			foreignBefore: portalTarget.querySelector('[data-slot="foreign-before"]') === foreignBefore,
			parent: parent === initialParent,
			second: container.querySelector('[data-slot="second"]') === initialSecond,
			third: container.querySelector('[data-slot="third"]') === initialThird,
		},
		portalSlots: slots(portalTarget),
		rootSlots: slots(parent),
		tick: parent.getAttribute('data-tick'),
	};
}

function setMode(mode: PortalPlacementMode) {
	flushSync(() => controls.setMode(mode));
	return snapshot();
}

async function stableRerender() {
	const parent = container.querySelector('[data-slot="parent"]')!;
	const first = parent.querySelector('[data-slot="first"]')!;
	const second = parent.querySelector('[data-slot="second"]')!;
	const third = parent.querySelector('[data-slot="third"]')!;
	const records: MutationRecord[] = [];
	const observer = new MutationObserver((next) => records.push(...next));
	observer.observe(parent, { childList: true, subtree: true });
	observer.observe(portalTarget, { childList: true, subtree: true });

	flushSync(() => controls.rerender());
	await Promise.resolve();
	records.push(...observer.takeRecords());
	observer.disconnect();

	return {
		...snapshot(),
		addedNodeCount: records.reduce((count, record) => count + record.addedNodes.length, 0),
		childListRecordCount: records.length,
		settledIdentity: {
			first: parent.querySelector('[data-slot="first"]') === first,
			second: parent.querySelector('[data-slot="second"]') === second,
			third: parent.querySelector('[data-slot="third"]') === third,
		},
	};
}

window.__portalPlacement = {
	setMode,
	snapshot,
	stableRerender,
	unmount() {
		root.unmount();
	},
};

declare global {
	interface Window {
		__portalPlacement: {
			setMode: typeof setMode;
			snapshot: typeof snapshot;
			stableRerender: typeof stableRerender;
			unmount(): void;
		};
	}
}
