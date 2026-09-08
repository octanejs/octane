import React from 'react';
import { act as reactAct } from 'react';
import { createRoot } from 'react-dom/client';
import { Drawer as ReactDrawer } from 'vaul';
import { describe, expect, it } from 'vitest';
import { act, mount } from '../../../octane/tests/_helpers.ts';
import { DrawerFixture } from '../_fixtures/drawer.tsrx';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
	true;

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	window.matchMedia = function matchMedia(query: string): MediaQueryList {
		return {
			matches: false,
			media: query,
			onchange: null,
			addListener: function addListener() {},
			removeListener: function removeListener() {},
			addEventListener: function addEventListener() {},
			removeEventListener: function removeEventListener() {},
			dispatchEvent: function dispatchEvent() {
				return false;
			},
		} as MediaQueryList;
	};
}

function findButton(container: ParentNode, label: string): HTMLButtonElement {
	const button = Array.from(container.querySelectorAll('button')).find(function matchLabel(node) {
		return (node.textContent ?? '').trim() === label;
	});
	if (!button) throw new Error(`missing button "${label}"`);
	return button as HTMLButtonElement;
}

function semanticSnapshot(content: Element | null) {
	return {
		role: content?.getAttribute('role'),
		direction: content?.getAttribute('data-vaul-drawer-direction'),
		visible: content?.getAttribute('data-vaul-drawer-visible'),
		title: content?.querySelector('[id]')?.textContent,
		text: content?.textContent,
	};
}

describe('vaul v1.1.2 React oracle', () => {
	// Per upstream/test/tests/base.spec.ts:10 (should open drawer).
	// Same closed trigger/content trees and click open on React Vaul and @octanejs/vaul.
	// @parity-case runtime:a739226076100d42
	it('matches React drawer semantics after opening', async () => {
		const reactHost = document.createElement('div');
		document.body.appendChild(reactHost);
		const root = createRoot(reactHost);
		let octane: ReturnType<typeof mount> | undefined;
		function ReactDrawerFixture() {
			const [open, setOpen] = React.useState(false);
			return React.createElement(
				ReactDrawer.Root,
				{ open: open, onOpenChange: setOpen },
				React.createElement(ReactDrawer.Trigger, null, 'Open drawer'),
				React.createElement(
					ReactDrawer.Portal,
					null,
					React.createElement(
						ReactDrawer.Content,
						null,
						React.createElement(ReactDrawer.Title, null, 'Account settings'),
						React.createElement(ReactDrawer.Description, null, 'Update your profile.'),
						React.createElement(ReactDrawer.Close, null, 'Close drawer'),
					),
				),
			);
		}
		try {
			await reactAct(function renderReact() {
				root.render(React.createElement(ReactDrawerFixture));
			});
			const reactTrigger = findButton(reactHost, 'Open drawer');
			await reactAct(function clickReactTrigger() {
				reactTrigger.click();
			});
			const reactContent = document.body.querySelector('[data-vaul-drawer]');
			expect(reactContent).not.toBeNull();

			octane = mount(DrawerFixture);
			const octaneTrigger = findButton(octane.container, 'Open drawer');
			await reactAct(async function clickOctaneTrigger() {
				await act(() => octaneTrigger.click());
			});
			const contents = document.body.querySelectorAll('[data-vaul-drawer]');
			const octaneContent = contents[contents.length - 1] ?? null;
			expect(octaneContent).not.toBeNull();
			expect(octaneContent).not.toBe(reactContent);
			expect(semanticSnapshot(octaneContent)).toEqual(semanticSnapshot(reactContent));
		} finally {
			await reactAct(function unmountRoots() {
				octane?.unmount();
				root.unmount();
			});
			reactHost.remove();
		}
	});
});
