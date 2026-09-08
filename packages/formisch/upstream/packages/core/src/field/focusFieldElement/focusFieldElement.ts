import type { InternalFieldStore } from '../../types/index.ts';

/**
 * Focuses the first focusable element of a field store. The elements are tried
 * in order and the first one that actually receives focus wins, so detached,
 * disabled or hidden elements are skipped. The browser decides focusability,
 * which is read back via the element's root `activeElement` so elements in a
 * shadow root or another document are handled correctly.
 *
 * Hint: A `display: none` or `hidden` element is correctly skipped in real
 * browsers, but jsdom has no layout and focuses it anyway, so that case cannot
 * be covered by unit tests.
 *
 * @param internalFieldStore The field store to focus.
 *
 * @returns Whether an element was focused.
 */
export function focusFieldElement(
  internalFieldStore: InternalFieldStore
): boolean {
  // Try to focus each element and stop at the first that actually receives
  // focus, so the focus is not consumed by an element that cannot be focused
  for (const element of internalFieldStore.elements) {
    element.focus();
    // Read focus back from the element's own root (shadow root or document)
    // so elements in a shadow DOM or another document are handled correctly
    if (
      (element.getRootNode() as Document | ShadowRoot).activeElement === element
    ) {
      return true;
    }
  }

  // Otherwise, no element could be focused
  return false;
}
