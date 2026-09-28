import type { LexicalEditor, TextNode } from 'lexical';
import { MenuOption } from '../LexicalMenuOption';
import { SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND } from '../LexicalTypeaheadMenuPluginUtils';
import {
	$getSelection,
	$isRangeSelection,
	CAN_USE_DOM,
	getParentElement,
	isDOMShadowRoot,
	isHTMLElement,
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

// Defined in their own entry points (as upstream) so the menu modules and
// consumers share one class/command identity; re-exported for internal importers.
export { MenuOption, SCROLL_TYPEAHEAD_OPTION_INTO_VIEW_COMMAND };

export const scrollIntoViewIfNeeded = (target: HTMLElement) => {
	const typeaheadContainerNode = target.closest('#typeahead-menu') as HTMLElement | null;
	if (!typeaheadContainerNode) {
		return;
	}
	const ownerWindow = target.ownerDocument.defaultView ?? window;
	const typeaheadRect = typeaheadContainerNode.getBoundingClientRect();
	if (typeaheadRect.top + typeaheadRect.height > ownerWindow.innerHeight) {
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

/**
 * Whether an element establishes the containing block that an absolutely
 * positioned descendant resolves its offsets against. Being positioned is the
 * usual reason, but a transform, filter, containment or a `will-change` naming
 * one of those does it too, on an otherwise statically positioned element.
 */
function establishesContainingBlock(style: CSSStyleDeclaration): boolean {
	if (style.position !== 'static') {
		return true;
	}
	const willChange = style.willChange;
	return (
		style.transform !== 'none' ||
		style.perspective !== 'none' ||
		style.filter !== 'none' ||
		style.backdropFilter !== 'none' ||
		style.contain.includes('paint') ||
		style.contain.includes('layout') ||
		style.contain.includes('strict') ||
		style.contain.includes('content') ||
		willChange.includes('transform') ||
		willChange.includes('perspective') ||
		willChange.includes('filter') ||
		willChange.includes('contain')
	);
}

/**
 * The anchor is absolutely positioned, so its `top`/`left` are resolved against
 * its containing block. That is the initial containing block (document
 * coordinates, hence the page scroll offsets) only while the anchor's ancestors
 * are all statically positioned. Walks up from the element the anchor is
 * appended to rather than from the anchor's `offsetParent`, because the anchor
 * is usually detached when this runs.
 *
 * @returns The viewport coordinates of the origin that the anchor's `top`/
 *   `left` are measured from, or `null` when document coordinates apply.
 */
export function getContainingBlockOrigin(
	parent: HTMLElement | ShadowRoot,
): null | { left: number; top: number } {
	// An anchor inside a shadow tree is laid out against the flat tree, so the
	// walk continues at the host.
	const start = isDOMShadowRoot(parent) ? parent.host : parent;
	for (
		let element: HTMLElement | null = isHTMLElement(start) ? start : null;
		element !== null;
		element = getParentElement(element)
	) {
		const view = element.ownerDocument.defaultView;
		if (view === null) {
			break;
		}
		if (establishesContainingBlock(view.getComputedStyle(element))) {
			const rect = element.getBoundingClientRect();
			return {
				left: rect.left + element.clientLeft - element.scrollLeft,
				top: rect.top + element.clientTop - element.scrollTop,
			};
		}
	}
	return null;
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
		return rootElement.ownerDocument.body;
	}
	return document.body;
}
