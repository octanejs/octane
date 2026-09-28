import { RovingTabIndexExtension, type RovingTabIndexOptions } from '@lexical/a11y';
import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { useCallback, useRef } from 'octane';

import { useLexicalComposerContext } from './LexicalComposerContext';
import { splitSlot, subSlot } from './shared/internal';

export type { RovingOrientation, RovingTabIndexOptions } from '@lexical/a11y';

// Ported from @lexical/react/src/useLexicalRovingTabIndexRef.ts. `options` is
// optional, so the trailing slot is found with splitSlot. Public
// signature is `(options?: RovingTabIndexOptions)`.

/**
 * Returns a callback ref that registers the attached element as a
 * roving-tabindex container with {@link RovingTabIndexExtension}, and releases
 * it when the element detaches. Requires `RovingTabIndexExtension` in the
 * editor's extension tree.
 */
export function useLexicalRovingTabIndexRef(...args: any[]): (node: HTMLElement | null) => void {
	const [user, slot] = splitSlot(args);
	const options = (user[0] as RovingTabIndexOptions | undefined) ?? {};
	const [editor] = useLexicalComposerContext();
	const { orientation, itemSelector } = options;
	const disposeRef = useRef<(() => void) | null>(null, subSlot(slot, 'ulrt:dispose'));

	return useCallback(
		(node: HTMLElement | null) => {
			if (disposeRef.current !== null) {
				disposeRef.current();
				disposeRef.current = null;
			}
			if (node !== null) {
				const dep = getExtensionDependencyFromEditor(editor, RovingTabIndexExtension);
				disposeRef.current = dep.output.register(node, { itemSelector, orientation });
			}
		},
		[editor, orientation, itemSelector],
		subSlot(slot, 'ulrt:ref'),
	);
}
