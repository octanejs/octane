import type { LexicalCommand, LexicalEditor, TextNode } from 'lexical';
import {
	$getSelection,
	$isRangeSelection,
	CAN_USE_DOM,
	createCommand,
	isDOMShadowRoot,
} from 'lexical';

// Non-hook, non-JSX shared pieces of @lexical/react/src/shared/LexicalMenu.tsx
// (the hooks live in useMenuAnchorRef.ts / useDynamicPositioning.ts; the LexicalMenu
// component in LexicalMenu.tsrx). Plain `.ts` — no compiler involvement.

export type MenuTextMatch = {
	leadOffset: number;
	matchingString: string;
	replaceableString: string;
};

export type MenuResolution = {
	match?: MenuTextMatch;
	getRect: () => DOMRect;
};

export type MenuRef = { current: HTMLElement | null };

export type MenuRenderFn<TOption extends MenuOption> = (
	anchorElementRef: MenuRef,
	itemProps: {
		selectedIndex: number | null;
		selectOptionAndCleanUp: (option: TOption) => void;
		setHighlightedIndex: (index: number) => void;
		options: TOption[];
	},
	matchingString: string,
) => unknown;

export type TriggerFn = (text: string, editor: LexicalEditor) => MenuTextMatch | null;

export class MenuOption {
	key: string;
	ref?: MenuRef;
	icon?: unknown;
	title?: unknown;

	constructor(key: string) {
		this.key = key;
		this.ref = { current: null };
		this.setRefElement = this.setRefElement.bind(this);
	}

	setRefElement(element: HTMLElement | null) {
		this.ref = { current: element };
	}
}

export const SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND: LexicalCommand<{
	index: number;
	option: MenuOption;
}> = createCommand('SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND');

export const scrollIntoViewIfNeeded = (target: HTMLElement) => {
	const typeaheadContainerNode = target.closest('#typeahead-menu') as HTMLElement | null;
	if (!typeaheadContainerNode) {
		return;
	}
	const typeaheadRect = typeaheadContainerNode.getBoundingClientRect();
	if (typeaheadRect.top + typeaheadRect.height > window.innerHeight) {
		typeaheadContainerNode.scrollIntoView({ block: 'center' });
	}
	if (typeaheadRect.top < 0) {
		typeaheadContainerNode.scrollIntoView({ block: 'center' });
	}
	target.scrollIntoView({ block: 'nearest' });
};

function getFullMatchOffset(documentText: string, entryText: string, offset: number): number {
	let triggerOffset = offset;
	for (let i = triggerOffset; i <= entryText.length; i++) {
		if (documentText.slice(-i) === entryText.substring(0, i)) {
			triggerOffset = i;
		}
	}
	return triggerOffset;
}

export function $splitNodeContainingQuery(match: MenuTextMatch): TextNode | null {
	const selection = $getSelection();
	if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
		return null;
	}
	const anchor = selection.anchor;
	if (anchor.type !== 'text') {
		return null;
	}
	const anchorNode = anchor.getNode();
	if (!anchorNode.isSimpleText()) {
		return null;
	}
	const selectionOffset = anchor.offset;
	const textContent = anchorNode.getTextContent().slice(0, selectionOffset);
	const characterOffset = match.replaceableString.length;
	const queryOffset = getFullMatchOffset(textContent, match.matchingString, characterOffset);
	const startOffset = selectionOffset - queryOffset;
	if (startOffset < 0) {
		return null;
	}
	let newNode;
	if (startOffset === 0) {
		[newNode] = anchorNode.splitText(selectionOffset);
	} else {
		[, newNode] = anchorNode.splitText(startOffset, selectionOffset);
	}
	return newNode;
}

export function isTriggerVisibleInNearestScrollContainer(
	targetElement: HTMLElement,
	containerElement: HTMLElement,
): boolean {
	const tRect = targetElement.getBoundingClientRect();
	const cRect = containerElement.getBoundingClientRect();
	const VISIBILITY_MARGIN_PX = 6;
	return (
		tRect.top >= cRect.top - VISIBILITY_MARGIN_PX &&
		tRect.top <= cRect.bottom + VISIBILITY_MARGIN_PX
	);
}

export function setContainerDivAttributes(containerDiv: HTMLElement, className?: string) {
	if (className != null) {
		containerDiv.className = className;
	}
	containerDiv.setAttribute('aria-label', 'Typeahead menu');
	containerDiv.setAttribute('role', 'listbox');
	containerDiv.style.display = 'block';
	containerDiv.style.position = 'absolute';
}

export function resolveMenuParent(editor: LexicalEditor): HTMLElement | ShadowRoot | undefined {
	if (!CAN_USE_DOM) {
		return undefined;
	}
	const rootElement = editor.getRootElement();
	if (rootElement !== null) {
		const root = rootElement.getRootNode();
		if (isDOMShadowRoot(root)) {
			return root as ShadowRoot;
		}
	}
	return document.body;
}
