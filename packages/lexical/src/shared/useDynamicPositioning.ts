import type { MenuResolution } from './menuShared';

import { getScrollParent } from '@lexical/utils';
import { getDOMShadowRoots } from 'lexical';
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
				const rootScrollParent =
					rootElement != null ? getScrollParent(rootElement, false) : document.body;
				let ticking = false;
				let previousIsInView = isTriggerVisibleInNearestScrollContainer(
					targetElement,
					rootScrollParent,
				);
				const handleScroll = function () {
					if (!ticking) {
						window.requestAnimationFrame(function () {
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
				window.addEventListener('resize', onReposition);
				document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
				const shadowRootSource = rootElement ?? targetElement;
				const enclosingShadowRoots = getDOMShadowRoots(shadowRootSource);
				for (const root of enclosingShadowRoots) {
					root.addEventListener('scroll', handleScroll, { capture: true, passive: true });
				}
				resizeObserver.observe(targetElement);
				return () => {
					resizeObserver.unobserve(targetElement);
					window.removeEventListener('resize', onReposition);
					document.removeEventListener('scroll', handleScroll, true);
					for (const root of enclosingShadowRoots) {
						root.removeEventListener('scroll', handleScroll, true);
					}
				};
			}
		},
		[targetElement, editor, onVisibilityChange, onReposition, resolution],
		slot,
	);
}
