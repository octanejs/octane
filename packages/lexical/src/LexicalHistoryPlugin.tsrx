// Ported from @lexical/react/src/LexicalHistoryPlugin.ts (+ shared/useHistory.ts
// inlined — it was a single-use internal hook, so the component's auto-slotted
// useMemo/useEffect cover it directly).
import { useLexicalComposerContext } from './LexicalComposerContext';
import { createEmptyHistoryState, registerHistory } from '@lexical/history';
import { useEffect, useMemo } from 'octane';

export { createEmptyHistoryState } from '@lexical/history';

export function HistoryPlugin(props) {
	const [editor] = useLexicalComposerContext();
	const externalHistoryState = props.externalHistoryState;
	const delay =
		props.delay === undefined ? 1000 : props.delay;

	const historyState = useMemo(() => externalHistoryState || createEmptyHistoryState(), [
		externalHistoryState,
	]);

	useEffect(() => registerHistory(editor, historyState, delay), [delay, editor, historyState]);

	return null;
}
