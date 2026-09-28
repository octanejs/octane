import { FocusManagerExtension, type FocusManagerOptions } from '@lexical/a11y';
import { getExtensionDependencyFromEditor } from '@lexical/extension';
import { useCallback, useRef } from 'octane';

import { useLexicalComposerContext } from './LexicalComposerContext';
import { splitSlot, subSlot } from './shared/internal';

export type { FocusManagerOptions } from '@lexical/a11y';

// Ported from @lexical/react/src/useLexicalFocusManagerRef.ts. `options` is
// optional, so the trailing slot is found with splitSlot. Public
// signature is `(options?: FocusManagerOptions)`.

/**
 * Returns a callback ref that registers the attached element as a focus-managed
 * toolbar with {@link FocusManagerExtension}, and releases it when the element
 * detaches. Requires `FocusManagerExtension` in the editor's extension tree.
 */
export function useLexicalFocusManagerRef(...args: any[]): (node: HTMLElement | null) => void {
	const [user, slot] = splitSlot(args);
	const options = (user[0] as FocusManagerOptions | undefined) ?? {};
	const [editor] = useLexicalComposerContext();
	const { toolbarItemSelector } = options;
	const disposeRef = useRef<(() => void) | null>(null, subSlot(slot, 'ulfm:dispose'));

	return useCallback(
		(node: HTMLElement | null) => {
			if (disposeRef.current !== null) {
				disposeRef.current();
				disposeRef.current = null;
			}
			if (node !== null) {
				const dep = getExtensionDependencyFromEditor(editor, FocusManagerExtension);
				disposeRef.current = dep.output.register(node, { toolbarItemSelector });
			}
		},
		[editor, toolbarItemSelector],
		subSlot(slot, 'ulfm:ref'),
	);
}
