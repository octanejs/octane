import { useLexicalIsTextContentEmpty } from '@octanejs/lexical/useLexicalIsTextContentEmpty';
import { useEffect } from 'octane';

// The upstream useLexicalIsTextContentEmptyResync test's `Test` component: one
// instance re-rendered with a different `editor` or `trim`. onRender receives
// the hook's value on every render; onMount fires once per instance so the test
// can prove a prop change updated this instance instead of remounting it.
export function IsEmptyResyncProbe(props) @{
	const isEmpty = useLexicalIsTextContentEmpty(props.editor, props.trim);
	props.onRender(isEmpty);
	useEffect(() => {
		props.onMount();
	}, []);

	<span data-empty={isEmpty ? 'true' : 'false'} />
}
