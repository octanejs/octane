import type { MenuResolution } from './menuShared';

import { getScrollParent } from '@lexical/utils';
import { getDOMShadowRoots, mergeRegister, registerEventListener } from 'lexical';
import { useEffect } from 'octane';

import { useLexicalComposerContext } from '../LexicalComposerContext';
import { isTriggerVisibleInNearestScrollContainer } from './menuShared';

// Ported from shared/LexicalMenu.tsx — repositions an open menu on scroll / resize.
// A single base hook (useEffect), so the caller's slot is forwarded directly.
export function useDynamicPositioning(
	resolution: MenuResolution | null,
	targetElement: HTMLElement | null,
	onReposition: () => void,
	onVisibilityChange?: (isInView: boolean) => void,
	slot?: symbol,
) {
	const [editor] = useLexicalComposerContext();
	useEffect(
		() => {
			if (targetElement != null && resolution != null) {
				const rootElement = editor.getRootElement();
				// Listen in the editor's own browsing context: an editor inside an
				// iframe scrolls and resizes with that frame, not the host window.
				const ownerDocument = rootElement != null ? rootElement.ownerDocument : document;
				const ownerWindow = ownerDocument.defaultView ?? window;
				const rootScrollParent =
					rootElement != null ? getScrollParent(rootElement, false) : ownerDocument.body;
				let ticking = false;
				let previousIsInView = isTriggerVisibleInNearestScrollContainer(
					targetElement,
					rootScrollParent,
				);
				const handleScroll = function () {
					if (!ticking) {
						ownerWindow.requestAnimationFrame(function () {
							onReposition();
							ticking = false;
						});
						ticking = true;
					}
					const isInView = isTriggerVisibleInNearestScrollContainer(
						targetElement,
						rootScrollParent,
					);
					if (isInView !== previousIsInView) {
						previousIsInView = isInView;
						if (onVisibilityChange != null) {
							onVisibilityChange(isInView);
						}
					}
				};
				const resizeObserver = new ResizeObserver(onReposition);
				// Scroll events are non-composed and do not cross shadow boundaries, so
				// also listen on the editor root's enclosing shadow roots (keyed off the
				// root rather than the target, which may be portaled into light DOM).
				const enclosingShadowRoots = getDOMShadowRoots(rootElement ?? targetElement);
				resizeObserver.observe(targetElement);
				return mergeRegister(
					registerEventListener(ownerWindow, 'resize', onReposition),
					registerEventListener(ownerDocument, 'scroll', handleScroll, {
						capture: true,
						passive: true,
					}),
					...enclosingShadowRoots.map((root) =>
						registerEventListener(root, 'scroll', handleScroll, {
							capture: true,
							passive: true,
						}),
					),
					() => resizeObserver.unobserve(targetElement),
				);
			}
		},
		[targetElement, editor, onVisibilityChange, onReposition, resolution],
		slot,
	);
}
