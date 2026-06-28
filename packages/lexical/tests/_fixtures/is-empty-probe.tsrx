import { useLexicalIsTextContentEmpty } from '@octanejs/lexical/useLexicalIsTextContentEmpty';
import { createEditor, ParagraphNode } from 'lexical';
import { useEffect, useMemo, useRef } from 'octane';

// Manual-editor (no LexicalComposer) probe, mirroring @lexical/react's
// useLexicalIsTextContentEmpty.test.tsx — the hook works against any editor.
export function IsEmptyProbe(props) @{
	const editor = useMemo(
		() => createEditor({
			namespace: '',
			nodes: [ParagraphNode],
			onError: (e) => {
				throw e;
			},
		}),
		[],
	);
	const ref = useRef(null);
	useEffect(() => {
		editor.setRootElement(ref.current);
	}, [ref, editor]);
	const isBlank = useLexicalIsTextContentEmpty(editor);
	useEffect(() => {
		props.onState(editor, isBlank);
	}, [isBlank, editor]);

	<div ref={ref} contenteditable="true" />
}
