import { FocusTrapExtension, type FocusTrapInitialFocus } from '@lexical/a11y';
import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { useCallback, useRef } from 'octane';

import { useLexicalComposerContext } from './LexicalComposerContext';
import { splitSlot, subSlot } from './shared/internal';

export type { FocusTrapInitialFocus } from '@lexical/a11y';

// Ported from @lexical/react/src/useLexicalFocusTrapRef.ts. `initialFocus` and
// `allowOutside` are optional, so the trailing slot is found with splitSlot. Public
// signature is `(isActive, initialFocus?, allowOutside?)`.

/**
 * Returns a callback ref that registers the attached element as a focus-trap
 * container with {@link FocusTrapExtension}. The trap activates when `isActive`
 * is `true` and the element is mounted, and is released when the element
 * detaches or `isActive` becomes `false`.
 *
 * `allowOutside` is held in a ref and read at event time, so an inline lambda
 * does not re-create the trap on every render. Requires `FocusTrapExtension` in
 * the editor's extension tree.
 */
export function useLexicalFocusTrapRef(...args: any[]): (node: HTMLElement | null) => void {
	const [user, slot] = splitSlot(args);
	const isActive = user[0] as boolean;
	const initialFocus = (user[1] as FocusTrapInitialFocus | undefined) ?? 'firstFocusable';
	const allowOutside = user[2] as ((target: HTMLElement) => boolean) | undefined;
	const [editor] = useLexicalComposerContext();
	const disposeRef = useRef<(() => void) | null>(null, subSlot(slot, 'ulft:dispose'));
	// Keep the latest predicate in a ref so an inline lambda doesn't change the
	// callback-ref identity (which would tear down and rebuild the trap every
	// render); the registered trap reads it at event time.
	const allowOutsideRef = useRef(allowOutside, subSlot(slot, 'ulft:allow'));
	allowOutsideRef.current = allowOutside;

	return useCallback(
		(node: HTMLElement | null) => {
			if (disposeRef.current !== null) {
				disposeRef.current();
				disposeRef.current = null;
			}
			if (node !== null && isActive) {
				const dep = getExtensionDependencyFromEditor(editor, FocusTrapExtension);
				disposeRef.current = dep.output.register(node, {
					allowOutside: (target) => {
						const fn = allowOutsideRef.current;
						return fn ? fn(target) : false;
					},
					initialFocus,
				});
			}
		},
		[editor, isActive, initialFocus],
		subSlot(slot, 'ulft:ref'),
	);
}
